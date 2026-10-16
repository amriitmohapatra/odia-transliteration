/**
 * The lens's settings page: the one switch for the online part (V4.5). Turning
 * translation on asks the browser for the optional host permission for the Odia
 * app's site only; turning it off gives the permission back. The permission is
 * the switch: there is no other stored setting.
 */

import { ASSIST_PERMISSION, TRANSLATE_NOTICE } from './assist.js';

const box = document.getElementById('translate') as HTMLInputElement;
const state = document.getElementById('state') as HTMLElement;
(document.getElementById('notice') as HTMLElement).textContent = TRANSLATE_NOTICE;

function show(on: boolean): void {
  box.checked = on;
  state.textContent = on
    ? 'On. The frame’s Translate button sends the text it read to the Odia app’s server.'
    : 'Off. The lens sends nothing anywhere.';
  state.className = on ? 'state on' : 'state';
}

void chrome.permissions.contains(ASSIST_PERMISSION).then(show);

box.addEventListener('change', () => {
  const want = box.checked;
  // The browser asks the reader to confirm a new permission (it must be called from this click).
  const change = want ? chrome.permissions.request(ASSIST_PERMISSION) : chrome.permissions.remove(ASSIST_PERMISSION);
  void change.then(
    () => chrome.permissions.contains(ASSIST_PERMISSION).then(show),
    () => chrome.permissions.contains(ASSIST_PERMISSION).then(show),
  );
});
