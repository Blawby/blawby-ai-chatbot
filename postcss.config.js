import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Ensure nodes created without `from` still carry a file for Vite URL rewriting.
const ensureSourceInput = () => ({
  postcssPlugin: 'ensure-source-input',
  Once(root) {
    const rootInput = root.source?.input;
    if (!rootInput?.file) {
      return;
    }

    root.walk((node) => {
      if (!node.source) {
        node.source = { input: rootInput };
        return;
      }

      if (!node.source.input) {
        node.source.input = rootInput;
        return;
      }

      if (!node.source.input.file) {
        node.source.input.file = rootInput.file;
      }
    });
  }
});
ensureSourceInput.postcss = true;

export default {
  plugins: [
    tailwindcss(),
    autoprefixer(),
    ensureSourceInput()
  ],
};
