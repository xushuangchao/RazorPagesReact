import eTest from "./utils/Test";

const Test: React.FC = () => {
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
    eTest();
    const root = window.ReactDOM.createRoot(container);
    root.render(<Test />);
};