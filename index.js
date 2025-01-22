#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const Table = require('cli-table3');

const program = new Command();

const defaultIgnoreDirs = ['node_modules', 'dist', 'tests'];
const prismaSchema = 'schema.prisma';

const isValidFile = (filePath) => {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath);
  return (
    (ext === '.js' || ext === '.ts' || baseName === prismaSchema) &&
    !defaultIgnoreDirs.some(dir => filePath.includes(dir))
  );
};

const getFileMetrics = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const nonCommentNonEmptyLines = lines.filter(line => {
    const trimmedLine = line.trim();
    return trimmedLine && !trimmedLine.startsWith('//') && !trimmedLine.startsWith('/*') && !trimmedLine.endsWith('*/');
  });
  const commentLines = lines.filter(line => {
    const trimmedLine = line.trim();
    return trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.endsWith('*/');
  });
  const blankLines = lines.filter(line => !line.trim());
  const codeAndCommentLines = lines.filter(line => {
    const trimmedLine = line.trim();
    return trimmedLine && (trimmedLine.includes('//') || trimmedLine.includes('/*') || trimmedLine.includes('*/'));
  });
  const characters = nonCommentNonEmptyLines.join('\n').length;
  return {
    lines: nonCommentNonEmptyLines.length,
    characters,
    commentLines: commentLines.length,
    blankLines: blankLines.length,
    codeAndCommentLines: codeAndCommentLines.length,
    totalLines: lines.length
  };
};

const processDirectory = (dir) => {
  let totalLines = 0;
  let totalCharacters = 0;
  let totalCommentLines = 0;
  let totalBlankLines = 0;
  let totalCodeAndCommentLines = 0;
  let fileCount = 0;
  let directoryCount = 0;

  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.lstatSync(filePath);

    if (stat.isSymbolicLink()) {
      return;
    }

    if (stat.isDirectory()) {
      directoryCount++;
      const {
        totalLines: lines,
        totalCharacters: characters,
        commentLines,
        blankLines,
        codeAndCommentLines,
        fileCount: files,
        directoryCount: directories
      } = processDirectory(filePath);
      totalLines += lines;
      totalCharacters += characters;
      totalCommentLines += commentLines;
      totalBlankLines += blankLines;
      totalCodeAndCommentLines += codeAndCommentLines;
      fileCount += files;
      directoryCount += directories;
    } else if (isValidFile(filePath)) {
      const { lines, characters, commentLines, blankLines, codeAndCommentLines } = getFileMetrics(filePath);
      totalLines += lines;
      totalCharacters += characters;
      totalCommentLines += commentLines;
      totalBlankLines += blankLines;
      totalCodeAndCommentLines += codeAndCommentLines;
      fileCount++;
    }
  });

  return {
    totalLines,
    totalCharacters,
    commentLines: totalCommentLines,
    blankLines: totalBlankLines,
    codeAndCommentLines: totalCodeAndCommentLines,
    fileCount,
    directoryCount
  };
};

const printMetrics = async (folder, metrics) => {
  const { default: chalk } = await import('chalk');
  const {
    totalLines,
    totalCharacters,
    commentLines,
    blankLines,
    codeAndCommentLines,
    fileCount,
    directoryCount
  } = metrics;
  const avgLinesPerFile = fileCount > 0 ? totalLines / fileCount : 0;
  const avgCharactersPerFile = fileCount > 0 ? totalCharacters / fileCount : 0;
  const avgCommentLinesPerFile = fileCount > 0 ? commentLines / fileCount : 0;
  const avgBlankLinesPerFile = fileCount > 0 ? blankLines / fileCount : 0;
  const avgCodeAndCommentLinesPerFile = fileCount > 0 ? codeAndCommentLines / fileCount : 0;

  const table = new Table({
    head: [chalk.blue.bold(`${folder} folder Metrics`), 'Values'],
    colWidths: [30, 20],
  });

  table.push(
    [chalk.green('Total lines of code'), totalLines],
    [chalk.green('Total characters'), totalCharacters],
    [chalk.green('Total comment lines'), commentLines],
    [chalk.green('Total blank lines'), blankLines],
    [chalk.green('Total code and comment lines'), codeAndCommentLines],
    [chalk.green('Files'), fileCount],
    [chalk.green('Directories'), directoryCount],
    [chalk.green('Avg lines per file'), avgLinesPerFile.toFixed(2)],
    [chalk.green('Avg characters per file'), avgCharactersPerFile.toFixed(2)],
    [chalk.green('Avg comment lines per file'), avgCommentLinesPerFile.toFixed(2)],
    [chalk.green('Avg blank lines per file'), avgBlankLinesPerFile.toFixed(2)],
    [chalk.green('Avg code and comment lines per file'), avgCodeAndCommentLinesPerFile.toFixed(2)]
  );

  console.log(table.toString());
};

program
  .name('codecrawl')
  .version('1.0.0')
  .description('CLI tool to gather metrics from code files')
  .option('-r, --root', 'Include root folder metrics')
  .option('-s, --src', 'Include src folder metrics')
  .option('-a, --all', 'Include both root and src folder metrics')
  .option('-d, --dir <directory>', 'Specify a directory to gather metrics from')
  .parse(process.argv);

const options = program.opts();

(async () => {
  const rootDir = path.resolve(__dirname);
  const srcDir = path.join(rootDir, 'src');

  if (options.root || options.all) {
    const rootMetrics = processDirectory(rootDir);
    await printMetrics('Root', rootMetrics);
  }

  if (options.src || options.all) {
    const srcMetrics = processDirectory(srcDir);
    await printMetrics('src', srcMetrics);
  }

  if (options.dir) {
    const specifiedDir = path.resolve(options.dir);
    const specifiedDirMetrics = processDirectory(specifiedDir);
    await printMetrics(options.dir, specifiedDirMetrics);
  }

  if (!options.root && !options.src && !options.all && !options.dir) {
    program.help();
  }
})();