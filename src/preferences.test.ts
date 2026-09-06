import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPreferences, openC41Preferences } from './preferences';

// jsdom doesn't implement <dialog> behavior (close()/open) or UXP's uxpShowModal at all,
// so both are stubbed here to make the dialog's open/close lifecycle deterministic in tests.
beforeEach(() => {
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, returnValue?: string) {
		if (returnValue !== undefined) this.returnValue = returnValue;
		this.open = false;
		this.dispatchEvent(new Event('close'));
	};
	HTMLDialogElement.prototype.uxpShowModal = function (this: HTMLDialogElement) {
		this.open = true;
		return new Promise((resolve) => {
			this.addEventListener('close', () => resolve(this.returnValue), { once: true });
		});
	};
});

afterEach(() => {
	localStorage.clear();
	document.body.innerHTML = '';
});

describe('getPreferences', () => {
	it('returns defaults when nothing is stored', () => {
		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', correctGammaForRawScans: false, linearProfileName: 'sRGB-elle-V4-g10.icc' });
	});

	it('reads a stored detection method and gamma flag', () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ detectionMethod: 'extreme', correctGammaForRawScans: true }));
		expect(getPreferences()).toEqual({ detectionMethod: 'extreme', correctGammaForRawScans: true, linearProfileName: 'sRGB-elle-V4-g10.icc' });
	});

	it('falls back to defaults on corrupt stored JSON', () => {
		localStorage.setItem('c41.preferences', '{not json');
		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', correctGammaForRawScans: false, linearProfileName: 'sRGB-elle-V4-g10.icc' });
	});

	it('falls back to the default method when the stored value is not a recognized mode', () => {
		// 'threshold' was a mode in older versions; prefs written then should not break.
		localStorage.setItem('c41.preferences', JSON.stringify({ detectionMethod: 'threshold' }));
		expect(getPreferences().detectionMethod).toBe('knee detection');
	});

	it('falls back to the default method when the stored value is missing', () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ correctGammaForRawScans: true }));
		expect(getPreferences().detectionMethod).toBe('knee detection');
	});

	it('coerces a non-boolean correctGammaForRawScans to false', () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ correctGammaForRawScans: 'yes' }));
		expect(getPreferences().correctGammaForRawScans).toBe(false);
	});

	it('keeps a stored string linearProfileName (including empty), else uses the bundled default', () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ linearProfileName: 'My Linear RGB' }));
		expect(getPreferences().linearProfileName).toBe('My Linear RGB');

		// An explicit empty string is a valid choice (disables the conversion).
		localStorage.setItem('c41.preferences', JSON.stringify({ linearProfileName: '' }));
		expect(getPreferences().linearProfileName).toBe('');

		// A non-string falls back to the bundled profile.
		localStorage.setItem('c41.preferences', JSON.stringify({ linearProfileName: 42 }));
		expect(getPreferences().linearProfileName).toBe('sRGB-elle-V4-g10.icc');
	});
});

describe('openC41Preferences', () => {
	it('pre-fills the form from the currently stored preferences', async () => {
		localStorage.setItem('c41.preferences', JSON.stringify({
			detectionMethod: 'extreme',
			correctGammaForRawScans: true,
			linearProfileName: 'My Linear RGB',
		}));

		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		expect(dialog.querySelector<HTMLInputElement>('#modeExtreme')!.checked).toBe(true);
		expect(dialog.querySelector<HTMLInputElement>('#modeKneeDetection')!.checked).toBe(false);
		expect(dialog.querySelector<HTMLInputElement>('#correctGamma')!.checked).toBe(true);
		expect(dialog.querySelector<HTMLInputElement>('#linearProfile')!.value).toBe('My Linear RGB');

		dialog.close();
		await opened;
	});

	it('saves extreme mode, the gamma checkbox, and the profile name when OK is clicked', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#modeExtreme')!.checked = true;
		dialog.querySelector<HTMLInputElement>('#correctGamma')!.checked = true;
		dialog.querySelector<HTMLInputElement>('#linearProfile')!.value = 'My Linear RGB';
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();
		await opened;

		expect(getPreferences()).toEqual({
			detectionMethod: 'extreme',
			correctGammaForRawScans: true,
			linearProfileName: 'My Linear RGB',
		});
		expect(document.querySelector('dialog')).toBeNull();
	});

	it('saves knee detection mode', async () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ detectionMethod: 'extreme' }));

		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#modeKneeDetection')!.checked = true;
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();
		await opened;

		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', correctGammaForRawScans: false, linearProfileName: 'sRGB-elle-V4-g10.icc' });
		expect(document.querySelector('dialog')).toBeNull();
	});

	it('discards changes and closes when Cancel is clicked', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#modeExtreme')!.checked = true;
		dialog.querySelector<HTMLButtonElement>('#cancelPreferences')!.click();
		await opened;

		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', correctGammaForRawScans: false, linearProfileName: 'sRGB-elle-V4-g10.icc' });
		expect(document.querySelector('dialog')).toBeNull();
	});
});
