import { brandIcon } from './brand-icon';
export const size = { width: 96, height: 96 };
export const contentType = 'image/png';
export default function Icon() {
  return brandIcon(size.width);
}
