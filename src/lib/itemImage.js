// Product photos. A picked file is shrunk to a small JPEG and kept on the item as a data URL (item.image), so it
// travels with the item to the Google Sheet (the "image" column of the Items tab) and prints from any computer.
// Every sync downloads every item, so a photo is kept small: about 12 KB, far under a cell's 50,000 characters.

const MAX_SIDE = 240; // px — plenty for a thumbnail on screen
const MAX_CHARS = 18000; // data URL length, ~13 KB of picture

export function readItemImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Please choose a picture file (JPG or PNG).'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That picture could not be opened.'));
      img.onload = () => {
        let side = MAX_SIDE;
        for (let attempt = 0; attempt < 6; attempt++) {
          const s = Math.min(1, side / img.width, side / img.height);
          const w = Math.max(1, Math.round(img.width * s));
          const h = Math.max(1, Math.round(img.height * s));
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const cx = c.getContext('2d');
          // JPEG has no transparency: put the picture on white paper first
          cx.fillStyle = '#fff';
          cx.fillRect(0, 0, w, h);
          cx.drawImage(img, 0, 0, w, h);
          for (const q of [0.8, 0.65, 0.5]) {
            const url = c.toDataURL('image/jpeg', q);
            if (url.startsWith('data:image/jpeg') && url.length <= MAX_CHARS) return resolve(url);
          }
          side = Math.round(side * 0.8);
        }
        reject(new Error('This picture is too detailed to keep. Try a simpler or smaller one.'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
