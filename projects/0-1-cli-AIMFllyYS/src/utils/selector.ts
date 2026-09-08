import * as readline from 'readline';
import chalk from 'chalk';

export interface SelectorOption {
  label: string;
  value: string;
  description?: string;
}

export interface SelectorConfig {
  title: string;
  options: SelectorOption[];
  onSelect: (value: string) => void | Promise<void>;
  onCancel?: () => void;
}

export async function interactiveSelect(config: SelectorConfig): Promise<void> {
  const { title, options, onSelect, onCancel } = config;

  if (options.length === 0) {
    console.log(chalk.yellow('没有可选项'));
    return;
  }

  let selectedIndex = 0;
  const totalLines = 3 + options.length;

  const clearRendered = () => {
    for (let i = 0; i < totalLines; i++) {
      process.stdout.write('\x1B[A\x1B[2K');
    }
  };

  const render = (first = false) => {
    if (!first) clearRendered();
    console.log(chalk.bold.cyan(title));
    console.log(chalk.gray('(Up/Down 或 j/k 选择，Enter 确认，Esc 取消)'));
    console.log('');
    options.forEach((option, index) => {
      const isSelected = index === selectedIndex;
      const prefix = isSelected ? chalk.green('>') : ' ';
      const label = isSelected ? chalk.bold.white(option.label) : chalk.white(option.label);
      const desc = option.description ? chalk.gray(` - ${option.description}`) : '';
      console.log(`${prefix} ${label}${desc}`);
    });
  };

  return new Promise<void>((resolve) => {
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode?.(true);
    process.stdin.resume();

    readline.emitKeypressEvents(process.stdin);
    render(true);

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      process.removeListener('exit', cleanup);
      process.removeListener('SIGINT', cleanup);
      if (!wasRaw) process.stdin.setRawMode?.(false);
      clearRendered();
    };

    const onKeypress = (str: string | undefined, key: readline.Key) => {
      if (!key) return;

      if (key.ctrl && key.name === 'c') {
        cleanup();
        onCancel?.();
        resolve();
        return;
      }

      if (key.name === 'escape') {
        cleanup();
        onCancel?.();
        resolve();
        return;
      }

      if (key.name === 'return') {
        cleanup();
        onSelect(options[selectedIndex].value);
        resolve();
        return;
      }

      if (key.name === 'up' || key.name === 'k') {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1;
        render();
      } else if (key.name === 'down' || key.name === 'j') {
        selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0;
        render();
      }
    };

    process.stdin.on('keypress', onKeypress);
    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
  });
}
