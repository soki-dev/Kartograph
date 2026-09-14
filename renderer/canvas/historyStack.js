const MAX_HISTORY = 100;

/**
 * Generischer Undo/Redo-Command-Stack. Ein Command ist {do(), undo()}; Tools
 * rufen push() nach jeder abgeschlossenen Aktion (z. B. einem Pinselstrich)
 * auf, nicht pro Einzel-Pixel, damit Undo einen ganzen Strich zurücknimmt.
 */
export class HistoryStack {
  constructor(onChange) {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange = onChange || (() => {});
  }

  push(command) {
    this.undoStack.push(command);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.onChange();
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.undo();
    this.redoStack.push(command);
    this.onChange();
    return true;
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.do();
    this.undoStack.push(command);
    this.onChange();
    return true;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }
}
