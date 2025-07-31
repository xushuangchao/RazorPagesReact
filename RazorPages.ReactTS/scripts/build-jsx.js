import esbuild from "esbuild";
import path from "path";
import chokidar from "chokidar";
import fs from "fs";
import { fileURLToPath } from "url";
import { checkDependency } from "./dependency-checker.js";

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 路径配置
const sourceDir = path.join(__dirname, "../PagesScripts");
const outputDir = path.join(__dirname, "../wwwroot/js");

// 环境判断
const isProduction = process.argv.includes('production');
const isDevelopment = !isProduction;

// 存储文件依赖关系
const dependencyGraph = new Map();

// ESBuild 配置
const baseBuildOptions = {
    bundle: true,
    target: ['es2015'],
    format: 'esm',
    loader: {
        '.ts': 'ts',
        '.tsx': 'tsx'
    },
    jsx: 'transform',
    outdir: outputDir,
    inject: [path.join(sourceDir, 'globals.d.ts')],
    external: [],
    minify: isProduction,
    sourcemap: isDevelopment ? 'inline' : false,
    // 别名配置
    alias: {
        'utils/httpClient': path.join(sourceDir, 'utils/httpClient.ts'),
        'utils/Test': path.join(sourceDir, 'utils/Test.ts'),
    }
};

/**
 * 分析文件依赖关系
 * @param filePath 文件路径
 */
const analyzeDependencies = (filePath) => {
    const fullPath = path.resolve(filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const importRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;

    const dependencies = [];
    let match;

    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        // 处理相对路径导入
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            const resolvedPath = path.resolve(path.dirname(fullPath), importPath);
            // 添加 .ts 和 .tsx 扩展名尝试
            const possiblePaths = [
                resolvedPath,
                resolvedPath + '.ts',
                resolvedPath + '.tsx',
                path.join(resolvedPath, 'index.ts'),
                path.join(resolvedPath, 'index.tsx')
            ];

            for (const possiblePath of possiblePaths) {
                if (fs.existsSync(possiblePath)) {
                    dependencies.push(possiblePath);
                    break;
                }
            }
        }
        // 处理别名导入
        else if (importPath.startsWith('utils/')) {
            const resolvedPath = path.join(sourceDir, importPath + '.ts');
            if (fs.existsSync(resolvedPath)) {
                dependencies.push(resolvedPath);
            }
        }
    }

    // 更新依赖图
    dependencyGraph.set(fullPath, dependencies);

    // 更新反向依赖关系（哪些文件依赖于当前文件）
    for (const [file, deps] of dependencyGraph.entries()) {
        if (deps.includes(fullPath) && file !== fullPath) {
            if (!dependencyGraph.has('reverse:' + fullPath)) {
                dependencyGraph.set('reverse:' + fullPath, []);
            }
            dependencyGraph.get('reverse:' + fullPath).push(file);
        }
    }
};

/**
 * 获取依赖于指定文件的所有文件
 * @param filePath 文件路径
 * @returns 依赖于该文件的所有文件列表
 */
const getDependentFiles = (filePath) => {
    const fullPath = path.resolve(filePath);
    const reverseKey = 'reverse:' + fullPath;
    return dependencyGraph.has(reverseKey) ? dependencyGraph.get(reverseKey) : [];
};

/**
 * 编译单个文件
 * @param (string) filePath 源文件路径
 */
const compileFile = async (filePath) => {
    // 确保是完整路径
    const fullPath = path.resolve(filePath);
    const relativePath = path.relative(sourceDir, fullPath);
    const parsedPath = path.parse(relativePath);
    const outPath = path.join(outputDir, parsedPath.dir, parsedPath.name + '.js');

    console.log(`🔄 正在编译: ${relativePath}`);

    // 依赖检查
    const unsafeImports = checkDependency(fullPath);
    if (unsafeImports.length > 0) {
        console.error(`⚠️ 在 ${relativePath} 中发现未声明的依赖：`);
        unsafeImports.forEach(({ dependency }) => console.error(`   - ${dependency}`));
        if (isProduction) {
            console.error('生产构建终止');
            process.exit(1);
        }
    }

    try {
        await esbuild.build({
            ...baseBuildOptions,
            entryPoints: [fullPath],
            outbase: sourceDir,
            outdir: outputDir,
            entryNames: path.join(path.dirname(relativePath), '[name]'),
        });
        console.log(`✅ 编译成功: ${relativePath} -> ${path.relative(outputDir, outPath)}`);

        // 分析并存储该文件的依赖关系
        analyzeDependencies(fullPath);
    } catch (e) {
        console.error(`❌ 编译失败：${relativePath}`, e.message);
    }
};

/**
 * 编译文件及其依赖者
 * @param filePath 修改的文件路径
 */
const compileFileWithDependents = async (filePath) => {
    // 首先编译被修改的文件
    await compileFile(filePath);

    // 然后编译所有依赖于该文件的文件
    const dependents = getDependentFiles(filePath);
    if (dependents.length > 0) {
        console.log(`🔄 检测到 ${dependents.length} 个依赖文件需要重新编译`);
        for (const dependent of dependents) {
            const relativePath = path.relative(sourceDir, dependent);
            console.log(`🔄 重新编译依赖文件: ${relativePath}`);
            await compileFile(dependent);
        }
    }
};

/**
 * 删除输出文件
 * @param filePath 源文件路径
 */
const removeoutputFile = (filePath) => {
    // 确保是完整路径
    const fullPath = path.resolve(filePath);
    const relativePath = path.relative(sourceDir, fullPath);
    const parsedPath = path.parse(relativePath);
    const outPath = path.join(outputDir, parsedPath.dir, parsedPath.name + '.js');

    if (fs.existsSync(outPath)) {
        fs.unlinkSync(outPath);
        console.log(`🗑️ 已删除：${path.relative(outputDir, outPath)}`)
    }

    // 从依赖图中移除该文件
    dependencyGraph.delete(fullPath);
    dependencyGraph.delete('reverse:' + fullPath);
};

// 获取所有 .ts 和 .tsx 文件
const getEntryPoints = () => {
    const entryPoints = [];
    const getAllFiles = (dir) => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                getAllFiles(filePath);
            } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                entryPoints.push(filePath);
            }
        });
    };
    getAllFiles(sourceDir);
    return entryPoints;
};

// 生产环境构建
if (isProduction) {
    console.log('🚀 正在构建生产环境...');
    const entryPoints = getEntryPoints();

    // 分析所有文件的依赖关系
    entryPoints.forEach(analyzeDependencies);

    await esbuild.build({
        ...baseBuildOptions,
        entryPoints: entryPoints,
        outbase: sourceDir,
        outdir: outputDir,
        entryNames: '[dir]/[name]',
    }).then(() => {
        console.log('✅ 生产环境构建完成');
        process.exit(0);
    }).catch((error) => {
        console.error('❌ 生产环境构建失败:', error.message);
        process.exit(1);
    });
}
// 开发环境监听
else {
    console.log('🚀 开发模式监听中...');

    // 初始全量构建
    const entryPoints = getEntryPoints();
    // 分析所有文件的依赖关系
    entryPoints.forEach(analyzeDependencies);

    await esbuild.build({
        ...baseBuildOptions,
        entryPoints: entryPoints,
        outbase: sourceDir,
        outdir: outputDir,
        entryNames: '[dir]/[name]',
    }).then(() => {
        console.log('✅ 初始构建完成，监听文件变化...');

        // 文件监听
        const watcher = chokidar.watch(sourceDir, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true,
            depth: 10
        });

        watcher
            .on('add', (filePath) => {
                if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                    console.log(`📄 添加文件: ${path.relative(sourceDir, filePath)}`);
                    analyzeDependencies(filePath);
                    compileFile(filePath);
                }
            })
            .on('change', (filePath) => {
                if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                    console.log(`✏️  文件变更: ${path.relative(sourceDir, filePath)}`);
                    compileFileWithDependents(filePath);
                }
            })
            .on('unlink', (filePath) => {
                if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                    console.log(`❌ 删除文件: ${path.relative(sourceDir, filePath)}`);
                    removeoutputFile(filePath);
                }
            })
            .on('error', (error) => {
                console.error(`❌ 监听错误: ${error}`);
            });

        console.log(`👀 正在监听目录: ${sourceDir}`);

        // 优雅退出
        process.on('SIGINT', () => {
            console.log('\n👋 监听已停止');
            watcher.close();
            process.exit(0);
        });
    }).catch((error) => {
        console.error('❌ 初始构建失败:', error.message);
        process.exit(1);
    });
}
