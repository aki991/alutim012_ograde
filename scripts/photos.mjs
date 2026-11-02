import sharp from 'sharp';
import fs from 'node:fs';
const dir = 'Slike';
const files = fs.readdirSync(dir).filter((f) => f.startsWith('ChatGPT')).sort();
const names = ['horizontal-01', 'horizontal-02', 'panel-01', 'dekor-01', 'staklo-01', 'kapija-lamele'];
for (let i = 0; i < files.length; i++) {
  await sharp(`${dir}/${files[i]}`).resize({ width: 1100, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(`src/assets/photos/${names[i]}.jpg`);
  await sharp(`${dir}/${files[i]}`).resize({ width: 420, height: 300, fit: 'cover' }).jpeg({ quality: 76, mozjpeg: true }).toFile(`src/assets/photos/${names[i]}-thumb.jpg`);
}
console.log(files.length, 'ok');
