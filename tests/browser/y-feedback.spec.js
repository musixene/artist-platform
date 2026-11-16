/*
 * The contents of this file are subject to the Common Public Attribution License Version 1.0
 * (CPAL-1.0); you may not use this file except in compliance with the License.
 * Obtain the License at https://opensource.org/license/CPAL-1.0 or see LICENSE.
 * The License is based on MPL 1.1; CPAL Sections 14 and 15 address attribution and network use.
 * Software distributed under the License is supplied AS IS, WITHOUT WARRANTY OF ANY KIND.
 * Original Code: Musixene Artist Platform.
 * Original and Initial Developer: Musixene (a trade name of Clara Vista Entertainment LLC).
 * Portions written by Musixene: Copyright (c) 2026 Musixene. All Rights Reserved.
 */
import { test, expect } from '@playwright/test';
test('private likes and notes survive reload, stay isolated and do not interrupt playback',async({page,browser})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:'New here? Create a listener account'}).click();
  await page.getByLabel('Username',{exact:true}).fill('feedback-alice');await page.getByLabel('Password',{exact:true}).fill('synthetic feedback browser password');await page.getByRole('button',{name:'Create listener account',exact:true}).click();
  const card=page.locator('#tracks>li').first();await expect(card.locator('.track')).toBeVisible();await card.locator('.track').click();
  await expect.poll(()=>page.locator('audio').evaluate(a=>!a.paused&&a.currentTime>0)).toBe(true);
  const like=card.getByRole('button',{name:'Like Morning signal',exact:true});await like.click();await expect(like).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.locator('audio').evaluate(a=>!a.paused)).toBe(true);
  await card.getByText('Note to Artist',{exact:true}).click();
  const privateText='<img src=x onerror="window.privateNoteRan=true"> My private note';
  await card.getByLabel('Your note').fill(privateText);await card.getByRole('button',{name:'Send note',exact:true}).click();await expect(card.getByRole('status')).toHaveText('Note sent privately to the artist.');
  await expect(card.locator('li p')).toHaveText(privateText);expect(await page.evaluate(()=>window.privateNoteRan)).toBeUndefined();await expect(card.locator('img')).toHaveCount(0);
  await page.reload();await expect(like).toHaveAttribute('aria-pressed','true');await card.getByText('Note to Artist',{exact:true}).click();await expect(card.locator('li p')).toHaveText(privateText);
  const context=await browser.newContext(),bob=await context.newPage();await bob.goto('http://localhost:3100/');await bob.getByRole('button',{name:'New here? Create a listener account'}).click();await bob.getByLabel('Username',{exact:true}).fill('feedback-bob');await bob.getByLabel('Password',{exact:true}).fill('synthetic feedback browser password');await bob.getByRole('button',{name:'Create listener account',exact:true}).click();
  const bobCard=bob.locator('#tracks>li').first();await bobCard.getByText('Note to Artist',{exact:true}).click();await expect(bobCard.getByRole('button',{name:'Like Morning signal',exact:true})).toHaveAttribute('aria-pressed','false');await expect(bobCard.locator('li')).toHaveCount(0);await expect(bob.getByText(privateText,{exact:true})).toHaveCount(0);
  await page.getByText('My private feedback',{exact:true}).click();await expect(page.locator('#feedback-data')).toContainText('1 likes · 1 notes');const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export this feedback page',exact:true}).click();expect((await download).suggestedFilename()).toBe('my-feedback-1.json');
  const admin=await context.newPage();await admin.goto('http://localhost:3100/');await admin.getByRole('button',{name:'Sign out',exact:true}).click();await admin.getByLabel('Username',{exact:true}).fill('browser-admin');await admin.getByLabel('Password',{exact:true}).fill('synthetic admin passphrase');await admin.getByRole('button',{name:'Sign in',exact:true}).click();await admin.getByRole('link',{name:'Administration',exact:true}).click();await admin.getByRole('button',{name:'Load feedback',exact:true}).click();await expect(admin.locator('#feedback')).toContainText(privateText);await expect(admin.locator('#feedback')).toContainText('feedback-alice');
  await admin.getByRole('button',{name:'Remove note',exact:true}).click();await expect(admin.locator('#feedback')).not.toContainText(privateText);await context.close();
  await card.getByRole('button',{name:'Delete note',exact:true}).click();await expect(card.locator('li')).toHaveCount(0);
  await page.getByLabel('I want to permanently delete all my likes and notes').check();await page.getByRole('button',{name:'Delete all my feedback',exact:true}).click();await expect(page.locator('#feedback-data')).toContainText('All your feedback was deleted');await expect(like).toHaveAttribute('aria-pressed','false');await page.reload();await expect(like).toHaveAttribute('aria-pressed','false');expect(errors).toEqual([]);
});
