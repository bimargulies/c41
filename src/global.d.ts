/// <reference types="@adobe-uxp-types/uxp/with-protocol" />
/// <reference types="@adobe-uxp-types/photoshop/with-protocol" />

// UXP's `os` is a top-level module (`require("os")`), not `require("uxp").os`
// as @adobe-uxp-types/uxp implies. https://developer.adobe.com/photoshop/uxp/2022/uxp/reference-js/Modules/os/OS/
declare module 'os' {
	export function platform(): string;
	export function homedir(): string;
	export function release(): string;
	export function arch(): string;
}

interface UxpShowModalOptions {
	title?: string;
	resize?: 'none' | 'both' | 'horizontal' | 'vertical';
	size?: { width: number; height: number };
}

interface HTMLDialogElement {
	/** UXP-specific: shows the dialog modally, resolving with the value passed to `close()`. */
	uxpShowModal(options?: UxpShowModalOptions): Promise<unknown>;
}

interface LimitValues {
	min: number;
	max: number;
}

interface AllLimitValues {
	red: LimitValues;
	green: LimitValues;
	blue: LimitValues;
}