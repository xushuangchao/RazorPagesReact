function getAxios() {
    if (typeof require != 'undefined'){
        try {
            return require('axios');
        }
        catch (e) {
            console.warn('无法通过 require 加载 axios，将使用全局 axiox');
        }
    }
    
    return window.axios;
}

const axiosInstance = getAxios();

const http = axiosInstance.create({
    baseURL: '/api',
    timeout: 10000,
    headers: {}
});

// 请求拦截器
http.interceptors.request.use(config => {
    // 添加认证令牌
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    } else {
        config.headers.Authorization = '';
    }
    
    // 开发环境日志
    if (process.env.Node_ENV == 'development') {
        console.log(`[请求] ${config.method?.toUpperCase()} ${config.url}`, config);
    }
    
    return config;
}, error => {
    console.error('请求错误', error);
    return Promise.reject(error);
});

// 响应拦截器
http.interceptors.response.use(response => {
    // 开发环境日志
    if (process.env.Node_ENV == 'development') {
        console.log(`[响应] ${response.config.url}`, response);
    }
    return response.data;
}, error => {
    // 统一错误处理
    const status = error.response?.status;
    console.error(`API 错误：${status}`, error);
    
    if (status == 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
    } else if (status == 403) {
        alert('您没有权限执行此操作');
    }
    
    return Promise.reject(error);
});

export default http;