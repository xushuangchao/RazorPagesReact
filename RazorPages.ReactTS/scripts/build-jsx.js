import esbuild from "esbuild";
import path from "path";
import chokidar from "chokidar";
import fs from "fs/promises";
import ts from "typescript";
import {
    config
} from "./config.js";
import {
    checkDependency
} from "./dependency-checker.js";

// 解构配置
const {
    sourceDir,
    outputDir,
    alias,
    allowedExternals,
    buildTargets,
    watchIgnore
} = config;

// 环境判断
const isProduction = process.argv.includes('production');
const isDevelopment = !isProduction;

// 存储文件依赖关系
const dependencyGraph = new Map();
// 跟踪正在编译的文件（放置循环依赖）
const compilingFiles = new Set();

// ESBuild 配置
const baseBuildOptions = {
    bundle: true,
    target: buildTargets,
    format: 'esm',
    // splitting: true, // 启用代码分割
    loader: {
        '.ts': 'ts',
        '.tsx': 'tsx'
    },
    jsx: 'transform',
    outdir: outputDir,
    external: allowedExternals,
    minify: isProduction,
    sourcemap: isDevelopment ? 'inline' : false,
    // 别名配置
    alias: alias,
    treeShaking: isProduction, // 生产环境启用树摇
    legalComments: 'external', // 生产环境移除注释
    define: {
        // 注入环境变量，替换代码中的 process.env.NODE_ENV
        'process.env.NODE_ENV': isProduction ? '"production"' : '"development"'
    }
};

/**
 * 使用TS解析器分析文件依赖
 * @param filePath 文件路径
 */
const analyzeDependencies = async (filePath) => {
    const fullPath = path.resolve(filePath);

    try {
        // 同步读取（分析依赖时阻塞可以接受）
        const content = fs.readFileSync ? fs.readFileSync(fullPath, 'utf8') : await fs.readFile(fullPath, 'utf8');

        // 使用TS解析器生成原文件
        const sourceFile = ts.createSourceFile(
            fullPath,
            content,
            ts.ScriptTarget.ES2015,
            true
        );

        const dependencies = [];

        // 遍历所有导入声明
        ts.forEachChild(sourceFile, (node) => {
            if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
                const importPath = ts.isStringLiteral(node.moduleSpecifier) ?
                    node.moduleSpecifier.text : '';

                if (!importPath) return;

                // 处理相对路径导入
                if (importPath.startsWith('./') || importPath.startsWith('../')) {
                    const resolvedPath = path.resolve(path.dirname(fullPath), importPath);
                    const possiblePaths = [
                        resolvedPath,
                        resolvedPath + '.ts',
                        resolvedPath + '.tsx',
                        path.join(resolvedPath, 'index.ts'),
                        path.join(resolvedPath, 'index.tsx')
                    ];

                    const checkPathExists = async (path) => {
                        try {
                            await fs.access(path);
                            return true;
                        } catch {
                            return false;
                        }
                    };
                    
                    // 寻找有效的文件路径
                    (async () => {
                        for (const possiblePath of possiblePaths) {
                            if (await checkPathExists(possiblePath)) {
                                dependencies.push(possiblePath);
                                break;
                            }
                        }
                    })();
                }
                // 处理别名导入
                else if (importPath.startsWith('utils/')) {
                    const resolvedPath = path.join(sourceDir, importPath + '.ts');

                    (async () => {
                        if (fs.existsSync(resolvedPath)) {
                            dependencies.push(resolvedPath);
                        }
                    })();
                }
            }
        });

        // 更新依赖图
        dependencyGraph.set(fullPath, dependencies);

        // 更新反向依赖关系（哪些文件依赖于当前文件）
        dependencies.forEach(depPath => {
            const reverseKey = `reverse:${depPath}`;
            if (!dependencyGraph.has(reverseKey)) {
                dependencyGraph.set(reverseKey, []);
            }
            if (!dependencyGraph.get(reverseKey).includes(fullPath)) {
                dependencyGraph.get(reverseKey).push(fullPath);
            }
        });
    } catch (error) {
        console.error(`❌ 依赖分析失败：${filePath}`, error);
    }
};

/**
 * 获取依赖于指定文件的所有文件
 * @param filePath 文件路径
 * @returns 依赖于该文件的所有文件列表
 */
const getDependentFiles = (filePath) => {
    const fullPath = path.resolve(filePath);
    const reverseKey = `reverse:${fullPath}`;
    return dependencyGraph.has(reverseKey) ? dependencyGraph.get(reverseKey) : [];
};

/**
 * 编译单个文件
 * @param filePath 源文件路径
 */
const compileFile = async (filePath) => {
    const fullPath = path.resolve(filePath);
    const relativePath = path.relative(sourceDir, fullPath);

    // 避免重复编译
    if (compilingFiles.has(fullPath)) {
        console.log(`⏩ 跳过编译（处理中）: ${relativePath}`);
        return;
    }

    console.log(`🔄 正在编译: ${relativePath}`);
    compilingFiles.add(fullPath);

    try {
        // 依赖检查
        const unsafeImports = checkDependency(fullPath);
        if (unsafeImports.length > 0) {
            console.error(`⚠️ 在 ${relativePath} 中发现未声明的依赖：`);
            unsafeImports.forEach(({
                                       dependency
                                   }) => console.error(`   - ${dependency}`));
            if (isProduction) {
                console.error('生产构建终止');
                process.exit(1);
            }
        }

        await esbuild.build({
            ...baseBuildOptions,
            entryPoints: [fullPath],
            outbase: sourceDir,
            outdir: outputDir,
            entryNames: path.join(path.dirname(relativePath), '[name]'),
        });

        const outPath = path.join(outputDir, path.dirname(relativePath), path.basename(fullPath, path.extname(fullPath)) + '.js');
        console.log(`✅ 编译成功: ${relativePath} -> ${path.relative(outputDir, outPath)}`);

        // 分析依赖
        analyzeDependencies(fullPath);
    } catch (e) {
        console.error(`❌ 编译失败：${relativePath}`);
        if (e.errors) {
            e.errors.forEach(err => console.error(`   - ${err.text}`));
        } else {
            console.error(`   详情：${e.message}`);
        }
    } finally {
        compilingFiles.delete(fullPath);
    }
};

/**
 * 编译文件及其依赖者（处理循环依赖）
 * @param filePath 修改的文件路径
 */
const compileFileWithDependents = async (filePath) => {
    const fullPath = path.resolve(filePath);
    if (compilingFiles.has(fullPath)) return;

    // 首先编译被修改的文件
    await compileFile(filePath);

    // 然后编译所有依赖于该文件的文件
    const dependents = getDependentFiles(filePath);
    if (dependents.length > 0) {
        console.log(`🔄 检测到 ${dependents.length} 个依赖文件需要重新编译`);
        for (const dependent of dependents) {
            await compileFileWithDependents(dependent); // 递归处理
        }
    }
};

/**
 * 删除输出文件并清理依赖
 * @param filePath 源文件路径
 */
const removeOutputFile = async (filePath) => {
    const fullPath = path.resolve(filePath);
    const relativePath = path.relative(sourceDir, fullPath);
    const outPath = path.join(outputDir, path.dirName(relativePath), path.basename(fullPath, path.exname(fullPath)) + '.js');

    try {
        await fs.access(outPath);
        await fs.unlink(outPath);
        console.log(`🗑️ 已删除：${path.relative(outputDir, outPath)}`);
    } catch (e) {
        // 文件不存在，不需要处理
    }

    // 清理依赖图
    const reverseKey = `reverse:${fullPath}`;
    // 清理依赖于该文件的条目
    if (dependencyGraph.has(reverseKey)) {
        dependencyGraph.get(reverseKey).forEach(depFile => {
            const deps = dependencyGraph.get(depFile) || [];
            dependencyGraph.set(depFile, deps.filter(dep => dep != fullPath));
        })
    }

    // 从依赖图中移除该文件
    dependencyGraph.delete(fullPath);
    dependencyGraph.delete('reverse:' + fullPath);
};

/**
 * 获取所有入口点
 * @returns {Promise<*[]>}
 */
const getEntryPoints = async () => {
    const entryPoints = [];
    const getAllFiles = async (dir) => {
        const files = await fs.readdir(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);
            if (stat.isDirectory()) {
                await getAllFiles(filePath);
            } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                entryPoints.push(filePath);
            }
        }
    };
    await getAllFiles(sourceDir);
    return entryPoints;
};

// 生产环境构建
if (isProduction) {
    baseBuildOptions.minifyWhitespace = true;
    baseBuildOptions.minifyIdentifiers = true;
    baseBuildOptions.minifySyntax = true;
    
    (async () => { // 异步IIFE处理顶层await
        console.log('🚀 正在构建生产环境...');
        try {
            const entryPoints = await getEntryPoints();
            // 分析所有文件依赖
            entryPoints.forEach(analyzeDependencies);

            await esbuild.build({
                ...baseBuildOptions,
                entryPoints: entryPoints,
                outbase: sourceDir,
                outdir: outputDir,
                entryNames: '[dir]/[name]',
            });
            console.log('✅ 生产环境构建完成');
            process.exit(0);
        } catch (error) {
            console.error('❌ 生产环境构建失败:', error.message);
            process.exit(1);
        }
    })();
}
// 开发环境监听
else {
    (async () => {
        console.log('🚀 开发模式监听中...');
        try {
            // 初始全量构建
            const entryPoints = await getEntryPoints();
            entryPoints.forEach(analyzeDependencies);

            await esbuild.build({
                ...baseBuildOptions,
                entryPoints: entryPoints,
                outbase: sourceDir,
                outdir: outputDir,
                entryNames: '[dir]/[name]',
            });
            console.log('✅ 初始构建完成，监听文件变化...');

            // 文件监听（使用集中配置的忽略规则）
            const watcher = chokidar.watch(sourceDir, {
                ignored: watchIgnore,
                persistent: true,
                ignoreInitial: true,
                depth: 10
            });

            watcher
                .on('add', async (filePath) => {
                    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                        console.log(`📄 添加文件: ${path.relative(sourceDir, filePath)}`);
                        analyzeDependencies(filePath);
                        await compileFile(filePath);
                    }
                })
                .on('change', async (filePath) => {
                    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                        console.log(`✏️  文件变更: ${path.relative(sourceDir, filePath)}`);
                        await compileFileWithDependents(filePath);
                    }
                })
                .on('unlink', async (filePath) => {
                    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                        console.log(`❌ 删除文件: ${path.relative(sourceDir, filePath)}`);
                        await removeOutputFile(filePath);
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
        } catch (error) {
            console.error('❌ 初始构建失败:', error.message);
            process.exit(1);
        }
    })();
}
