// resort content based on paragraphs, table, lists and titles
const fs = require("fs");
const path = require("path");
const readline = require('readline');
const { compareText } = require('./helpers')

const sortTag = "<!--sort-->"; // must be on a single line right before the first item
const sortBlockTag = "<!--sort-block-->"; // delimits blocks that are trimmed and have all HTML removed for sorting purposes, must be placed before each block
const sortByTag = "<!--sort-by-->"; // on table column header: columns to use for sorting
const sortRollTag = "<!--sort-roll-->"; // on table column header: columns to use for sorting
const sortCellsTag = "<!--sort-cells-->"; // on table column header: ignore table and sort cell content from selected columns
const sortEndTag = "<!--sort-end-->"; // must be on a single line after a blank line
const sortUnionTag = "<!--sort-union-->"; // join with the previous item during sorting
const sortSkipTagRE = /<span[^>]*class="[^"]*sort-skip[^"]*"[^>]*>.*?<\/span>/gi; // use <span class="sort-skip"> to ignore articles like The
const tableColumnRE = /(?<!\\)\|/;
const rollDash = '–';

function readDirectory(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((item) => {
        if (item.isDirectory()) {
            readDirectory(path.join(dir, item.name));
        } else if (item.isFile()) {
            processFile(path.join(dir, item.name));
        } else {
            console.log("Something wrong: {}", item.name);
        }
    });
}

function processFile(file) {
    let target = path.join(outputDir, path.relative(sourceDir, file));
    if (path.extname(file) != ".md") {
        // here we copy everything
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(file, target)
        return;
    }
    let contents = fs.readFileSync(file, 'utf8');
    if (contents.includes(sortTag)) {
        console.log(`> ${file}`)
        let reversedLines = contents.split('\n').reverse();
        let result = [];
        while (reversedLines.length > 0) {
            const line = reversedLines.pop();
            result.push(line);
            if (line.includes(sortTag)) {
                result.push(...resortContent(reversedLines));
            }
        }
        contents = result.join('\n');
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
}

if (process.argv.length != 3 || !fs.statSync(process.argv[2], { throwIfNoEntry: false })?.isDirectory()) {
    console.log("You must inform a valid source directory.");
    process.exit(1);
}
var sourceDir = path.resolve(process.argv[2]);
var outputDir = sourceDir + ".sorted";

if (fs.statSync(outputDir, { throwIfNoEntry: false })?.isDirectory()) {
    console.log(`Target directory "${outputDir}" already exists.`);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('Overwrite [y/n]? ', (answer) => {
        if (answer == "y") {
            fs.rmdirSync(outputDir, { recursive: true });
            resortFiles();
            process.exit(0)
        }
        else {
            console.log("Exiting...");
            process.exit(1);
        }
    });
}
else {
    resortFiles();
}

function compare(a, b) {
    return compareText(a.replace(sortSkipTagRE,''), b.replace(sortSkipTagRE,''));
}

function resortContent(reversedLines) {
    let result = [];
    let tableByCol = 1;
    let tableRollCol = -1;
    let tableCells = [];
    // text: "", list: "-", table: "|", title: "#+ "
    let delimiter = reversedLines.at(-1)?.match(/^\s*(-|\||#+ )/)?.[0] ?? "";
    const sortBlockMode = reversedLines.at(-1)?.trim() === sortBlockTag;
    if (sortBlockMode) {
        delimiter = sortBlockTag;
    }
    if (delimiter === "|") {
        let headerLine = reversedLines.pop();
        let cols = headerLine.split(tableColumnRE); // index 0 and last should be empty
        tableCells = cols.map((value, index) => value.includes(sortCellsTag) ? index : -1).filter(index => index > 0);
        tableByCol = cols.findIndex(value => value.includes(sortByTag));
        tableRollCol = cols.findIndex(value => value.includes(sortRollTag));
        if (tableByCol >= 0 && tableCells.length > 0) {
            throw new Error(`Cannot use sort-by with sort-cells.`);
        }
        tableByCol = tableByCol >= 0 ? tableByCol : 1;
        result.push(headerLine);
        headerLine = reversedLines.pop();
        result.push(headerLine);
    }
    let unsortedBlocks = [];
    let currTarget = result;
    let newBlockReady = true;
    while (reversedLines.length > 0) {
        const line = reversedLines.pop();
        const emptyLine = line.trim() === "";
        if (line.includes(sortEndTag) || (emptyLine && (delimiter === "|" || delimiter === "-"))) {
            if (sortBlockMode) {
                unsortedBlocks = unsortedBlocks.map(lines => lines.join("\n"));
                unsortedBlocks.sort((a, b) => compare(a, b));
                result.push(...unsortedBlocks);
                result.push(line);
                break;
            }
            // if sorting by title or text, make sure the last line of each block is empty
            if (delimiter === "" || delimiter.startsWith("#")) {
                unsortedBlocks.forEach(block => {
                    if (block[block.length - 1].trim() !== "")
                        block.push("");
                });
            }
            if (delimiter === "|") {
                unsortedBlocks = unsortedBlocks.map(block => block.map(row => row.split(tableColumnRE)));
                let currRollValue = Number.parseInt(unsortedBlocks[0][0][tableRollCol]?.trim().split(rollDash)[0]);
                const rollColWidth = unsortedBlocks[0][0][tableRollCol]?.length;
                if (tableCells.length > 0) { // sort only cell content
                    let cellContent = [];
                    tableCells.forEach(colIndex => cellContent.push(...unsortedBlocks.map(block => block[0][colIndex])));
                    cellContent.sort((a, b) => compare(a, b));
                    cellContent.reverse();
                    tableCells.forEach(colIndex => unsortedBlocks.forEach(block => block[0][colIndex] = cellContent.pop()));
                    const sortedRows = unsortedBlocks.flat();
                    result.push(...sortedRows.map(row => row.join("|")));
                } else { // regular sort
                    unsortedBlocks.sort((a, b) => compare(a[0][tableByCol], b[0][tableByCol]));
                    const sortedRows = unsortedBlocks.flat();
                    if (tableRollCol >= 0) {
                        sortedRows.forEach(row => {
                            const values = row[tableRollCol].trim().split(rollDash).map(v => Number.parseInt(v));
                            const extraRange = values.length > 1 ? values[1] - values[0] : 0;
                            const newRollCellValues = ` ${currRollValue}${extraRange > 0 ? `${rollDash}${currRollValue + extraRange}` : ""} `;
                            // I'm assuming the cell content is centered
                            row[tableRollCol] = newRollCellValues.padStart((rollColWidth + newRollCellValues.length) / 2).padEnd(rollColWidth);
                            currRollValue += extraRange + 1;
                        });
                    }
                    result.push(...sortedRows.map(row => row.join("|")));
                }
            } else {
                unsortedBlocks.sort((a, b) => compare(a[0], b[0]));
                const sortedLines = unsortedBlocks.flat();
                result.push(...sortedLines);
            }
            result.push(line);
            break;
        }
        if (emptyLine) {
            currTarget.push(line);
            newBlockReady = true;
            continue;
        }
        if (line.includes(sortTag)) {
            currTarget.push(line);
            currTarget.push(...resortContent(reversedLines));
            continue;
        }
        if (sortBlockMode) {
            if (line.includes(sortBlockTag)) {
                unsortedBlocks.push([]);
                currTarget = unsortedBlocks[unsortedBlocks.length - 1];
            }
            currTarget.push(line);
            continue;
        }
        if (line.includes(sortUnionTag)) {
            currTarget.push(line);
            newBlockReady = false;
            continue;
        }
        if (newBlockReady && line.trimStart().startsWith(delimiter)) {
            unsortedBlocks.push([]);
            currTarget = unsortedBlocks[unsortedBlocks.length - 1];
            newBlockReady = delimiter === "|" || delimiter === "-";
        }
        currTarget.push(line);
    }
    if (result.length === 0) {
        throw new Error(`End of file while sorting. The <!--sort-end--> tag is mandatory for text, title and block sorting.`);
    }
    return result;
}

function resortFiles() {
    readDirectory(sourceDir);
    console.log(`\n\nProcess complete.\nResorted files written to: "${outputDir}"`);
}
