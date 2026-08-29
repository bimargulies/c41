import { afterEach, describe, expect, it, vi } from 'vitest';

const mockHistograms: Record<string, number[]> = {
	Red: [1, 2, 3],
	Green: [4, 5, 6],
	Blue: [7, 8, 9],
};

vi.mock('./histogram', () => ({
	getChannelHistograms: vi.fn(async () => new Map(Object.entries(mockHistograms))),
}));

const getFileForSaving = vi.fn();
vi.mock('uxp', () => ({
	storage: {
		localFileSystem: {
			getFileForSaving,
		},
	},
}));

const { writeChannelHistogramsFile } = await import('./exportHistograms');

afterEach(() => {
	getFileForSaving.mockReset();
});

describe('writeChannelHistogramsFile', () => {
	it('writes the three channel histograms as TypeScript constants to the chosen file', async () => {
		const write = vi.fn();
		getFileForSaving.mockResolvedValue({ write });

		await writeChannelHistogramsFile();

		expect(getFileForSaving).toHaveBeenCalledWith('histograms.ts', { types: ['ts'] });
		expect(write).toHaveBeenCalledTimes(1);
		const contents = write.mock.calls[0][0] as string;
		expect(contents).toContain('export const redHistogram: number[] = [1, 2, 3];');
		expect(contents).toContain('export const greenHistogram: number[] = [4, 5, 6];');
		expect(contents).toContain('export const blueHistogram: number[] = [7, 8, 9];');
	});

	it('does nothing if the user cancels the save dialog', async () => {
		getFileForSaving.mockResolvedValue(undefined);

		await writeChannelHistogramsFile();

		expect(getFileForSaving).toHaveBeenCalled();
	});
});
