import eTest from "./utils/Test";
import HttpClient from "./utils/httpClient";

// 定义data-*属性参数类型(对应 data-xxx 属性，驼峰命名)
interface DatasetProps {
    apiEndpoint: string;
}

const Test: React.FC<{ container: HTMLElement }> = ({ container }) => {
    // 获取 data-* 属性参数
    const dataset = container.dataset as unknown as DatasetProps;
    // 注意 dataset 返回原生字符串，需手动转换类型
    const apiEndpoint = dataset.apiEndpoint || "/user";
    console.log('data-* 属性参数：',apiEndpoint);

    // 获取 window.reactProps 参数
    console.log('window.reactProps ：',window.reactProps);

    // 发送 GET 请求
    HttpClient.get("https://api.github.com/users/octocat").then(data => {
        console.log(data);
    });

    // 调用 eTest 函数
    eTest();
  return (
    <>
      <h1>Hello, World!</h1>
        <p>This is a test page.</p>
        <p>The page is rendered using React.</p>
        <p>This is a test page.</p>
    </>
  );
};

export const PageContent = (container: HTMLElement) => {
    const root = window.ReactDOM.createRoot(container);
    root.render(<Test container={container} />);
};