/**
 * Utility per la manipolazione e compressione di immagini lato client.
 * Riduce drasticamente le dimensioni dei file (es. foto scattate da smartphone a 12-15MB)
 * a circa 200-400KB mantenendo un'altissima qualità visiva, ottimizzando banda e quote Storage.
 */
export async function compressImage(
  file: File,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.82
): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        resolve(file);
        return;
      }

      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          resolve(file);
          return;
        }

        // Se le dimensioni superano i limiti, ridimensiona mantenendo il rapporto d'aspetto
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(file);
          return;
        }

        // Disegna l'immagine sul canvas con interpolazione di qualità
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve(blob);
            } else {
              // Se la compressione non ha ridotto le dimensioni, mantieni il file originale
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => resolve(file);
      img.src = dataUrl;
    };

    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/**
 * Comprime e ritaglia centralmente un'immagine del giocatore per l'avatar.
 * Produce un'immagine quadrata ottimizzata (default 384x384px @ 82% quality)
 * riducendo il peso da ~10MB a ~30-50KB, eliminando lag e jank su mobile.
 */
export async function compressAvatar(
  file: File,
  size = 384,
  quality = 0.82
): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        resolve(file);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;

        if (naturalWidth <= 0 || naturalHeight <= 0) {
          resolve(file);
          return;
        }

        // Calcola ritaglio centrale quadrato per non distorcere il viso
        const minSide = Math.min(naturalWidth, naturalHeight);
        const sourceX = Math.round((naturalWidth - minSide) / 2);
        const sourceY = Math.round((naturalHeight - minSide) / 2);

        // Risoluzione finale (max 384px o dimensione originale se inferiore)
        const targetSize = Math.min(size, minSide);

        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          img,
          sourceX,
          sourceY,
          minSide,
          minSide,
          0,
          0,
          targetSize,
          targetSize
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => resolve(file);
      img.src = dataUrl;
    };

    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

