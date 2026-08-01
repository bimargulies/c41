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
		expect(getPreferences()).toEqual({ useThreshold: false, threshold: 0 });
	});

	it('merges stored values over the defaults', () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ useThreshold: true, threshold: 42 }));
		expect(getPreferences()).toEqual({ useThreshold: true, threshold: 42 });
	});

	it('falls back to defaults on corrupt stored JSON', () => {
		localStorage.setItem('c41.preferences', '{not json');
		expect(getPreferences()).toEqual({ useThreshold: false, threshold: 0 });
	});
});

describe('openC41Preferences', () => {
	it('pre-fills the form from the currently stored preferences', async () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ useThreshold: true, threshold: 55 }));

		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		expect(dialog.querySelector<HTMLInputElement>('#useThreshold')!.checked).toBe(true);
		expect(dialog.querySelector<HTMLInputElement>('#threshold')!.value).toBe('55');

		dialog.close();
		await opened;
	});

	it('saves the form values and closes when OK is clicked with a valid threshold', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#useThreshold')!.checked = true;
		dialog.querySelector<HTMLInputElement>('#threshold')!.value = '42';
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();
		await opened;

		expect(getPreferences()).toEqual({ useThreshold: true, threshold: 42 });
		expect(document.querySelector('dialog')).toBeNull();
	});

	it('discards changes and closes when Cancel is clicked', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#useThreshold')!.checked = true;
		dialog.querySelector<HTMLInputElement>('#threshold')!.value = '99';
		dialog.querySelector<HTMLButtonElement>('#cancelPreferences')!.click();
		await opened;

		expect(getPreferences()).toEqual({ useThreshold: false, threshold: 0 });
		expect(document.querySelector('dialog')).toBeNull();
	});

	it('rejects an out-of-range threshold, shows an error, and does not save or close', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#threshold')!.value = '150';
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();

		expect(getPreferences()).toEqual({ useThreshold: false, threshold: 0 });
		expect(document.querySelector('dialog')).not.toBeNull();
		expect(dialog.querySelector('#thresholdError')!.textContent).not.toBe('');

		dialog.close();
		await opened;
	});

	it('rejects an empty threshold, shows an error, and does not save or close', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#threshold')!.value = '';
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();

		expect(getPreferences()).toEqual({ useThreshold: false, threshold: 0 });
		expect(document.querySelector('dialog')).not.toBeNull();
		expect(dialog.querySelector('#thresholdError')!.textContent).not.toBe('');

		dialog.close();
		await opened;
	});

	it('clears a previous error once a valid threshold is submitted', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;
		const thresholdInput = dialog.querySelector<HTMLInputElement>('#threshold')!;
		const okButton = dialog.querySelector<HTMLButtonElement>('#okPreferences')!;

		thresholdInput.value = '150';
		okButton.click();
		expect(dialog.querySelector('#thresholdError')!.textContent).not.toBe('');

		thresholdInput.value = '50';
		okButton.click();
		await opened;

		expect(getPreferences()).toEqual({ useThreshold: false, threshold: 50 });
	});
});
