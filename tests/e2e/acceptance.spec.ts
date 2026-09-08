import { test, expect } from '@playwright/test';
let sessionToken: string | undefined;
test.afterEach(async ({ request }) => {
  if (sessionToken)
    await request.patch('http://localhost:3000/users/me', {
      headers: { Authorization: `Bearer ${sessionToken}` },
      data: { visible: false },
    });
  sessionToken = undefined;
});

test('denied location has an explicit Bordeaux fallback on a compact viewport', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.context().grantPermissions([]);
  await page.goto('/');
  await page.getByLabel('Ton prenom', { exact: true }).fill('Alex');
  await page.getByLabel('Ton pseudo', { exact: true }).fill(`qa_${Date.now().toString(36)}`);
  const registration = page.waitForResponse(
    (r) => r.url().endsWith('/users') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Faire connaissance' }).click();
  sessionToken = (await (await registration).json()).token;
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: "Entrer dans l'app" }).click();
  await expect(
    page.getByText('Active ta localisation pour decouvrir les personnes autour de toi.'),
  ).toBeVisible();
  await page.screenshot({ path: `artifacts/${info.project.name}-denied.png`, fullPage: true });
  await page.getByRole('button', { name: 'Explorer Bordeaux', exact: true }).click();
  await expect(page.getByText('Bordeaux · mode demo')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon[title="Lina"]')).toBeVisible();
  await page.screenshot({ path: `artifacts/${info.project.name}-compact-map.png`, fullPage: true });
});
test('onboarding, consent, map radius, profile, realtime demo chat and visibility', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 44.8378, longitude: -0.5792 });
  await page.goto('/');
  await page.getByLabel('Ton prenom', { exact: true }).fill('Camille');
  await page.getByLabel('Ton pseudo', { exact: true }).fill(`qa_${Date.now().toString(36)}`);
  await page.screenshot({ path: `artifacts/${info.project.name}-onboarding.png`, fullPage: true });
  const registration = page.waitForResponse(
    (response) => response.url().endsWith('/users') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Faire connaissance' }).click();
  sessionToken = (await (await registration).json()).token;
  await expect(page.getByRole('button', { name: "Entrer dans l'app" })).toBeDisabled();
  await page.getByRole('checkbox').click();
  await page.screenshot({ path: `artifacts/${info.project.name}-charter.png`, fullPage: true });
  await page.getByRole('button', { name: "Entrer dans l'app" }).click();
  await expect(page.locator('.leaflet-marker-icon[title="Sarah"]')).toBeVisible();
  const otherPeople = (await page.locator('.leaflet-marker-icon').count()) - 3;
  await expect(
    page.getByText(`${otherPeople + 2} personnes proches`, { exact: true }),
  ).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Rayon de decouverte' });
  await slider.focus();
  await slider.press('Home');
  await slider.press('ArrowRight');
  await slider.press('ArrowRight');
  await slider.press('ArrowRight');
  await expect(page.getByText('200 m', { exact: true })).toBeVisible();
  await expect(
    page.getByText(`${otherPeople + 1} ${otherPeople ? 'personnes proches' : 'personne proche'}`, {
      exact: true,
    }),
  ).toBeVisible();
  for (let i = 0; i < 16; i++) await slider.press('ArrowRight');
  await expect(page.getByText('1 km', { exact: true })).toBeVisible();
  await expect(
    page.getByText(`${otherPeople + 3} personnes proches`, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(
    page.locator('.leaflet-marker-icon').filter({ has: page.locator('img') }),
  ).toHaveCount(otherPeople + 3);
  await page.screenshot({ path: `artifacts/${info.project.name}-map.png`, fullPage: true });
  await page.locator('.leaflet-marker-icon[title="Lina"]').click();
  await expect(page.getByText('Lina', { exact: true })).toBeVisible();
  await page.screenshot({ path: `artifacts/${info.project.name}-person.png`, fullPage: true });
  await page.getByRole('button', { name: 'Discuter', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Salut, on se retrouve sur les quais ?');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(
    page.getByText('Salut ! Partant pour une balade sur les quais ?', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `artifacts/${info.project.name}-chat.png`, fullPage: true });
  await page.reload();
  await expect(
    page.getByText('Salut, on se retrouve sur les quais ?', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retour aux messages' }).click();
  await expect(
    page.getByText('Salut ! Partant pour une balade sur les quais ?', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: /Mon profil/ }).click();
  await page.getByRole('switch', { name: 'Visible a proximite' }).click();
  await expect(page.getByText('Tu explores en toute discretion.')).toBeVisible();
  expect(errors).toEqual([]);
});
