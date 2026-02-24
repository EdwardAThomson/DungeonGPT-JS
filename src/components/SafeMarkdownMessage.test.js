import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SafeMarkdownMessage from './SafeMarkdownMessage';

describe('SafeMarkdownMessage', () => {
  it('renders safe https links as anchors', () => {
    render(<SafeMarkdownMessage content={'Visit [OpenAI](https://openai.com)'} />);

    const link = screen.getByRole('link', { name: 'OpenAI' });
    expect(link).toHaveAttribute('href', 'https://openai.com');
  });

  it('does not render unsafe javascript links as anchors', () => {
    render(<SafeMarkdownMessage content={'Bad [link](javascript:alert(1))'} />);

    expect(screen.queryByRole('link', { name: 'link' })).toBeNull();
    expect(screen.getByText(/Bad\s+link\)/)).toBeInTheDocument();
  });

  it('truncates extremely long content safely', () => {
    const longText = 'a'.repeat(20050);
    render(<SafeMarkdownMessage content={longText} />);

    expect(screen.getByText('[content truncated for safety]')).toBeInTheDocument();
  });

  it('strips disallowed control characters', () => {
    render(<SafeMarkdownMessage content={'Hello\u0007World'} />);

    expect(screen.getByText('HelloWorld')).toBeInTheDocument();
  });
});
