import fs from 'fs';

// 允许的外部依赖
const ALLOWED_EXTERNALS = [
    'react',
    'react-dom',
    'axios',
    'utils/httpClient',
    'utils/Test',
];

/**
 * 检查非法依赖导入
 * @param filePath 文件路径
 * @returns {Array<dependency: string>} 非法依赖列表
 */
function checkDependency(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const importRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
    
    const imports = [];
    let match;
    
    while ((match = importRegex.exec(content)) != null) {
        imports.push(match[1]);
    }
    
    // 筛选非法依赖
    return imports.filter(dep => {
        // 忽略白名单依赖
        if (ALLOWED_EXTERNALS.includes(dep)) return false;
        
        // 允许相对路径导入
        if (dep.startsWith('./') || dep.startsWith('../')) return false;
        
        // 允许绝对路径导入
        if (dep.startsWith('/')) return false;
        
        return true;
    }).map(dependency => ({ dependency }));
}

export { checkDependency };