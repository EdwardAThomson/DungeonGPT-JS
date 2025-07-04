import { createContext, useState } from 'react';

const CharacterContext = createContext();

export const CharacterProvider = ({ children }) => {
  const [characters, setCharacters] = useState([]);
  const [editingCharacterIndex, setEditingCharacterIndex] = useState(null);

  return (
    <CharacterContext.Provider
      value={{ characters, setCharacters, editingCharacterIndex, setEditingCharacterIndex }}>
      {children}
    </CharacterContext.Provider>
  );
};

export default CharacterContext;
