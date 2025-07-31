// 声明全局变量
interface Window {
    React: typeof import('react');
    ReactDOM: typeof import('react-dom');
    axios: typeof import('axios');
}

// 声明全局模块
declare const React: Window['React'];
declare const ReactDOM: Window['ReactDOM'];
declare const axios: Window['axios'];

// 声明 httpClient 模块
declare module 'utils/httpClient' {
    const http: import('axios').AxiosInstance;
    export default http;
}

declare module 'utils/Test' {
    const eTest: () => void;
    export default eTest;
}