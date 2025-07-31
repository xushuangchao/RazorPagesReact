import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
    sourceDir: path.join(__dirname, "../PagesScripts"),
    outputDir: path.join(__dirname, "../wwwroot/js"),
    // 别名配置
    alias: {
        'utils/httpClient': path.join(__dirname, 'utils/httpClient.ts'),
        'utils/Test': path.join(__dirname, 'utils/Test.ts'),
    },
    // 允许的外部依赖
    allowedExternals: [
        'react', 'react-dom', 'axios', 'utils/httpClient', 'utils/Test'
    ],
    // 构建目标配置
    buildTargets: [ 'es2015' ],
    // 监听忽略规则
    watchIgnore: [/(^|[\/\\])\../, '**/node_modules/**']
};