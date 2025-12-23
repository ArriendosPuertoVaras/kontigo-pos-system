import { db } from './db';

export const SettingsKeys = {
    RESTAURANT_NAME: 'restaurant_name',
    IS_CONFIGURED: 'system_configured'
};

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const setting = await db.settings.get({ key });
    return setting ? setting.value as T : defaultValue;
}

export async function setSetting(key: string, value: any) {
    await db.settings.put({ key, value });
}

export async function isSystemConfigured(): Promise<boolean> {
    return await getSetting<boolean>(SettingsKeys.IS_CONFIGURED, false);
}
