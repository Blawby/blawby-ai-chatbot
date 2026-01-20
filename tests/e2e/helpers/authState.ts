import { join } from 'path';

export const AUTH_DIR = join(process.cwd(), 'playwright', '.auth');

export const AUTH_STATE_PATHS = {
  owner: join(AUTH_DIR, 'owner.json'),
  client: join(AUTH_DIR, 'client.json'),
  anonymous: join(AUTH_DIR, 'anonymous.json')
};
