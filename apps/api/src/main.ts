import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpException,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import {
  changePasswordSchema,
  loginSchema,
  pointSchema,
  profileSchema,
  pushSchema,
  radiusSchema,
  registerSchema,
} from '@nearme/shared';
import { config } from './config';
import { pool } from './db';
import { data } from './service';
import { Realtime } from './realtime';

async function identity(request: Request, requireCharter = true) {
  const user = await data.authenticate(request.headers.authorization?.replace(/^Bearer /, ''));
  if (requireCharter && !user.charterAccepted) throw new HttpException('Accepte la charte', 403);
  return user.id;
}
const uuid = (value: string) => z.uuid().parse(value);
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof ZodError) {
      response.status(400).json({
        message: 'Donnees invalides',
        issues: error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
      return;
    }
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json({ message: error.message });
      return;
    }
    const code = (error as { code?: string })?.code;
    if (code === '23505') {
      response.status(409).json({ message: 'Ce nom est deja utilise' });
      return;
    }
    if (code === '23503') {
      response.status(404).json({ message: 'Profil introuvable' });
      return;
    }
    console.error('Request failed', error instanceof Error ? error.message : 'unknown');
    response.status(500).json({ message: 'Serveur indisponible. Reessaie.' });
  }
}
@Controller()
class ApiController {
  @Get('health') async health() {
    await pool.query('SELECT PostGIS_Version()');
    return { status: 'ok', database: 'postgis', demo: config.demo };
  }
  @Post('auth/register') register(@Body() body: unknown) {
    return data.register(registerSchema.parse(body));
  }
  @Post('auth/login') async login(@Body() body: unknown) {
    const input = loginSchema.parse(body);
    const session = await data.login(input.username, input.password);
    realtime.disconnectUser(session.user.id);
    return session;
  }
  @Post('auth/logout') async logout(@Req() req: Request) {
    const id = await identity(req, false);
    const result = await data.logout(id);
    realtime.disconnectUser(id);
    return result;
  }
  @Post('users/me/password') async changePassword(@Req() req: Request, @Body() body: unknown) {
    const input = changePasswordSchema.parse(body);
    return data.changePassword(
      await identity(req, false),
      input.currentPassword,
      input.newPassword,
    );
  }
  @Delete('users/me') async deleteAccount(@Req() req: Request) {
    const id = await identity(req, false);
    await data.deleteAccount(id);
    realtime.disconnectUser(id);
    return { success: true };
  }
  @Get('users/me') async me(@Req() req: Request) {
    return data.me(await identity(req, false));
  }
  @Post('users/me/charter') async accept(@Req() req: Request) {
    return data.accept(await identity(req, false));
  }
  @Patch('users/me') async update(@Req() req: Request, @Body() body: unknown) {
    const id = await identity(req);
    const result = await data.updateProfile(
      id,
      profileSchema.partial().extend({ visible: z.boolean().optional() }).parse(body),
    );
    realtime.refresh();
    return result;
  }
  @Post('location') async location(@Req() req: Request, @Body() body: unknown) {
    const result = await data.location(await identity(req), pointSchema.parse(body));
    realtime.refresh();
    return result;
  }
  @Get('nearby') async nearby(@Req() req: Request, @Query('radius') radius: string) {
    return data.nearby(await identity(req), radiusSchema.parse(radius));
  }
  @Post('demo/seed') async seed(@Req() req: Request, @Body() body: unknown) {
    const result = await data.seed(await identity(req), pointSchema.parse(body));
    realtime.refresh();
    return result;
  }
  @Post('conversations/with/:id') async conversation(
    @Req() req: Request,
    @Param('id') peer: string,
  ) {
    return data.conversation(await identity(req), uuid(peer));
  }
  @Get('conversations') async conversations(@Req() req: Request) {
    return data.conversations(await identity(req));
  }
  @Get('conversations/:id/messages') async history(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('before') before?: string,
  ) {
    return data.history(await identity(req), uuid(id), before ? uuid(before) : undefined);
  }
  @Post('conversations/:id/read') async read(@Req() req: Request, @Param('id') id: string) {
    await data.read(await identity(req), uuid(id));
    return { success: true };
  }
  @Post('devices/push-token') async push(@Req() req: Request, @Body() body: unknown) {
    const id = await identity(req);
    const input = pushSchema.parse(body);
    await pool.query(
      'INSERT INTO push_tokens(user_id,token,platform) VALUES($1,$2,$3) ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,updated_at=now()',
      [id, input.token, input.platform],
    );
    return { success: true };
  }
  @Post('users/:id/block') async block(@Req() req: Request, @Param('id') peer: string) {
    const result = await data.block(await identity(req), uuid(peer));
    realtime.refresh();
    return result;
  }
  @Post('users/:id/report') async report(
    @Req() req: Request,
    @Param('id') peer: string,
    @Body() body: unknown,
  ) {
    const id = await identity(req);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(body);
    await data.assertPeer(id, uuid(peer));
    await pool.query('INSERT INTO reports(reporter_id,reported_id,reason) VALUES($1,$2,$3)', [
      id,
      peer,
      reason,
    ]);
    return { success: true };
  }
}
@Module({ controllers: [ApiController] })
class AppModule {}
const app = await NestFactory.create(AppModule);
app.use(helmet());
app.use(
  rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }),
);
app.use('/users', rateLimit({ windowMs: 60_000, limit: 40 }));
app.use('/auth', rateLimit({ windowMs: 60_000, limit: 10 }));
app.enableCors({ origin: config.origins });
app.useGlobalFilters(new Errors());
const realtime = new Realtime(app.getHttpServer());
await pool.query('SELECT PostGIS_Version()');
await app.listen(config.port, '0.0.0.0');
console.log(`NearMe API listening on http://localhost:${config.port}; demo=${config.demo}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    realtime.close();
    void app
      .close()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
