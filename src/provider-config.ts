export type UploadProvider = 'picgo' | 's.ee';

export interface RawUploadSettings {
    provider?: string;
    picgoPath?: string;
    seeApiKey?: string;
    autoUploadOnPaste?: boolean;
}

export interface UploadSettings {
    provider: UploadProvider;
    picgoPath: string;
    seeApiKey: string;
    autoUploadOnPaste: boolean;
}

export interface SeeUploadResponse {
    success?: boolean;
    code?: number;
    message?: string;
    data?: {
        url?: string;
    };
}

export function resolveUploadSettings(raw: RawUploadSettings, env: NodeJS.ProcessEnv): UploadSettings {
    const provider = raw.provider === 'picgo' ? 'picgo' : 's.ee';
    const envToken = env.SEE_API_TOKEN?.trim();
    const settingToken = raw.seeApiKey?.trim();

    return {
        provider,
        picgoPath: raw.picgoPath?.trim() || 'picgo',
        seeApiKey: envToken || settingToken || '',
        autoUploadOnPaste: raw.autoUploadOnPaste ?? true
    };
}

export function parseSeeUploadResponse(response: SeeUploadResponse): string | null {
    if (!response.success) {
        return null;
    }

    const url = response.data?.url;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
}
