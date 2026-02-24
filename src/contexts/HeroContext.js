import { createContext, useState } from 'react';

const HeroContext = createContext();

export const HeroProvider = ({ children }) => {
  const [heroes, setHeroes] = useState([]);
  const [editingHeroIndex, setEditingHeroIndex] = useState(null);

  return (
    <HeroContext.Provider
      value={{ heroes, setHeroes, editingHeroIndex, setEditingHeroIndex }}>
      {children}
    </HeroContext.Provider>
  );
};

export default HeroContext;
