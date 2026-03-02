const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace logo.jpeg with logo.png
    content = content.replace(/logo\.jpeg/g, 'logo.png');

    // Increase logo size
    content = content.replace(/style="height: 50px;?"/g, 'style="height: 85px;"');

    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
});
