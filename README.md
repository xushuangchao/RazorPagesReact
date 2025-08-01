## 开发模式
开发时进入到 `RazorPages.ReactTS` 文件夹下，执行 `npm run watch:jsx` 启动文件监听, PagesScript 文件夹中的 ts/tsx 文件发生变化时会自动编译到 `wwwroot/js` 文件夹下
<img width="950" height="357" alt="image" src="https://github.com/user-attachments/assets/560c31e2-a0cd-4c5c-9fc6-08dcc872f99c" />
你的 `.tsx` 页面中需要包含 `PageContent` 的默认导出(_Layout.csheml 中可替换 95～96行 )，用于页面的渲染，主要内容如下：

``` tsx
import eTest from "./utils/Test";

const Test: React.FC = () => {
  eTest();
  return (
    <>
      <h1>Hello, World!</h1>
        <p>This is a test page.</p>
        <p>The page is rendered using React.</p>
        <p>This is a test page using React.</p>
    </>
  );
};

export const PageContent = (container: HTMLElement) => {
    const root = window.ReactDOM.createRoot(container);
    root.render(<Test />);
};
```

随后你只需要创建一个对应的Razor Pages页面，并创建挂载点即可将其展示

``` cshtml
@page
@model RazorPages.ReactTS.Pages.TestPageModel
@{
    ViewData["Title"] = "Test Page";
}

<div id="test-page" data-react-component="/js/Test.js"></div>
```

参数传递

由于并非React项目方式构建，参数传递可通过 元素标签属性 `data-*` 获取指定参数 或 `window.reactProps` 获取全局参数， window.reactProps 在 `_Layout.cshtml` 中进行初始化
<img width="2195" height="285" alt="image" src="https://github.com/user-attachments/assets/36b6949d-3839-4add-a505-d8fa6230b79c" />
``` tsx
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
        <p>This is a test page using React.</p>
    </>
  );
};

export const PageContent = (container: HTMLElement) => {
    const root = window.ReactDOM.createRoot(container);
    // 将 container 传递给组件
    root.render(<Test container={container} />);
};
```

开发调试输出

当处于开发环境是，若是 tsx/ts 文件中的日志，会显示自源文件，生产环境则为编译后的js文件
<img width="2195" height="199" alt="image" src="https://github.com/user-attachments/assets/44cbffa0-58d5-4b2e-8d86-8060c3abab10" />
<img width="2195" height="239" alt="image" src="https://github.com/user-attachments/assets/445477f3-afc8-4d35-a763-26a7ce402e69" />

## 生产模式
发布生产需配置如下内容：
1. 调整 `.csproj` 文件内容

   ``` xml
   <Project Sdk="Microsoft.NET.Sdk.Web">

    <PropertyGroup>
        <TargetFramework>net8.0</TargetFramework>
        <Nullable>enable</Nullable>
        <ImplicitUsings>enable</ImplicitUsings>
    </PropertyGroup>
    
    <!--JSX构建集成-->
    <Target Name="BuildJSX" BeforeTargets="BeforeBuild">
        <Exec Command="npm run build:jsx" Condition="'$(Configuration)' == 'Release'" />
    </Target>
    
    <Target Name="CleanJSX" AfterTargets="Clean">
        <RemoveDir Directories="$(ProjectDir)wwwroot\js" />
    </Target>
    
    <ItemGroup>
        <Content Include="PagesScripts\**" />
        <PackageReference Include="Microsoft.VisualStudio.Web.CodeGeneration.Design" Version="8.0.7" />
    </ItemGroup>

  </Project>
  
2. publish 发布前操作配置(Before launch)
   添加新任务(Add New Task)-运行 npm 脚本(run npm script)
   
   package.json 不要使用bin文件夹下的，scrips： `build:jsx` 参数为：`production`
   <img width="744" height="463" alt="image" src="https://github.com/user-attachments/assets/47590784-7b5d-431e-9fec-c044373c9bbd" />
