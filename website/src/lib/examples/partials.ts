import type { ExampleSpec } from '../example';

export default {
  'partials-inline': {
    hint: 'Press a button illustration to edit its label and state. The buttons are part of the sentence.',
    markdown: 'Press @Button("Save", "primary") to keep your changes, or @Button("Cancel", "default") to leave them.\n\nWhen there is nothing to save, the button is @Button("Save", "disabled").',
    source: false,
  },
  'partials-insert': {
    hint: 'Type @button after “Press”, choose a state, then select the inserted button to change its label.',
    markdown: 'Press  to continue.',
  },
  'partials-readonly': {
    hint: 'In a published guide, buttons illustrate the instructions without performing an action.',
    markdown: 'Choose @Button("Add receipt", "default") on Home to add a receipt.\n\nA destructive action can be shown as @Button("Delete", "danger").',
    readOnly: true,
    source: false,
  },
} satisfies Record<string, ExampleSpec>;
