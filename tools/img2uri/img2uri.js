export async function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

export async function urlToDataUri(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Error al descargar');
    const blob = await response.blob();
    return await fileToDataUri(blob);
  } catch (error) {
    throw error;
  }
}