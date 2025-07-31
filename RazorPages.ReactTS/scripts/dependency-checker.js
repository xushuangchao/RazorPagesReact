import {
    config
} from "./config.js";
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// 允许的外部依赖
const {
    allowedExternals,
    sourceDir
} = config;

/**
 * 检查非法依赖导入
 * @param filePath 文件路径
 * @returns {Array<dependency: string>} 非法依赖列表
 */
export const checkDependency = (filePath) => {
    const fullPath = path.resolve(filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        fullPath,
        content,
        ts.ScriptTarget.ES2015,
        true
    );

    const unsafeImports = [];

    ts.forEachChild(sourceFile, (node) => {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
            const importPath = ts.isStringLiteral(node.moduleSpecifier) ?
                node.moduleSpecifier.text : '';

            if (!importPath) return;

            if (!allowedExternals.includes(importPath) &&
                !importPath.startsWith('./') &&
                !importPath.startsWith('../') &&
                !importPath.startsWith('utils/')) {
                unsafeImports.push({
                    file: filePath,
                    dependency: importPath
                });
            }
        }
    });
    
    return unsafeImports;
}