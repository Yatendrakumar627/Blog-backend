const fs = require('fs');
const path = require('path');

function resolveFile(filepath) {
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        const lines = content.split(/\r?\n/);

        let newLines = [];
        let mode = 'normal'; // normal, inside_head, inside_incoming
        let modified = false;

        for (const line of lines) {
            if (line.trim().startsWith('<<<<<<< HEAD')) {
                mode = 'inside_head';
                modified = true;
                continue;
            }

            if (line.trim().startsWith('=======')) {
                if (mode === 'inside_head') {
                    mode = 'inside_incoming';
                }
                continue;
            }

            if (line.trim().startsWith('>>>>>>>')) {
                mode = 'normal';
                continue;
            }

            if (mode === 'normal' || mode === 'inside_head') {
                newLines.push(line);
            }
            // inside_incoming lines are skipped
        }

        if (modified) {
            console.log(`Resolving conflicts in: ${filepath}`);
            fs.writeFileSync(filepath, newLines.join('\n'), 'utf8');
        }

    } catch (e) {
        console.error(`Error processing ${filepath}: ${e.message}`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);

        if (stat.isDirectory()) {
            if (file === 'node_modules' || file === '.git') continue;
            walkDir(filepath);
        } else {
            if (file === 'resolve_conflicts.js' || file === 'resolve_conflicts.py' || file === 'resolve_conflicts.cjs') continue;
            resolveFile(filepath);
        }
    }
}

console.log("Starting conflict resolution...");
const rootDir = __dirname;
walkDir(rootDir);
console.log("Conflict resolution complete.");
