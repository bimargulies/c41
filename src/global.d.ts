/// <reference types="@adobe-uxp-types/uxp/with-protocol" />
/// <reference types="@adobe-uxp-types/photoshop/with-protocol" />

interface UxpShowModalOptions {
	title?: string;
	resize?: 'none' | 'both' | 'horizontal' | 'vertical';
	size?: { width: number; height: number };
}

interface HTMLDialogElement {
	/** UXP-specific: shows the dialog modally, resolving with the value passed to `close()`. */
	uxpShowModal(options?: UxpShowModalOptions): Promise<unknown>;
}
