export function getUploadSizeCategory(fileSizeKb: number) {
  if (fileSizeKb <= 1024) return 'up_to_1mb';
  if (fileSizeKb <= 3 * 1024) return 'up_to_3mb';
  return 'up_to_5mb';
}
