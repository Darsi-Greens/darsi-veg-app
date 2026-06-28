// Shared Cloudinary unsigned upload (free tier, no billing card).
// Used for vegetable photos (Admin) and payment receipts (Orders).

const CLOUD_NAME    = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export function cloudinaryConfigured() {
  return !!CLOUD_NAME && !!UPLOAD_PRESET;
}

export async function uploadImage(uri, folder = 'uploads') {
  const form = new FormData();
  form.append('file', { uri, type: 'image/jpeg', name: `${Date.now()}.jpg` });
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', folder);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form }
  );
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'Cloudinary upload failed');
  return data.secure_url;
}
