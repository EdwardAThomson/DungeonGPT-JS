---

Title: Building DungeonGPT: How I Built an AI-Powered Dungeon Game with React and OpenAI
Date: "2025-07-21"
Category: "artificial-intelligence"
Tags: AI, JavaScript, React, OpenAI, SQLite, Web Development, Cursor
Description: "A journey through the development of DungeonGPT, an AI-powered dungeon game built with React and OpenAI."

---

# Building DungeonGPT: How I Built an AI-Powered Dungeon Game with React and OpenAI

This project started as a D&D character generator, using OpenAI's API to generate stats and character descriptions based on user input. It was also a way to familiarize myself with JS, React and the OpenAI API. 

The goal was always to build a game, of sorts, where players could create their own characters and then play against an AI-powered dungeon master. I got there eventually, but it was a long journey. I also built the app in Python too, as I found it easier to work with (no need for databases and servers), however I came back to the React version and finally finished it.

The great thing about web apps is that they can be played from anywhere, as long as you have an internet connection. This means that players can play from their phones, tablets, or computers, and they can also play with friends from all over the world. Harder to do that with Python apps, as you need to have the app installed on each device.

## Starting Out
Originally, I worked inside ChatGPT, which was an improvement on me trying to code things alone, but this was error prone and not paticularly efficient.

Eventually, I moved to using the Cursor IDE, which was a significant improvement. Not only does it provide AI assistance, but it also shows the changes it makes directly inside the files. This was a game changer for me, as it meant less errors when copying and pasting code, plus it is also much faster to make changes.

As mentioned, I started in JavaScript and it was quite a learning curve for me. Some of the functions in JS feel rather abstruse compared to Python. For example, the arrow function in JS looks like a series of random characters. It is supposedly the same as lambda functions in Python, but it is not nearly as readable.

When I look at the characters of an arrow function, I can't really guess what it will do. Admittedly, they are a little challenging in Python at first sight, but it is not as bad as it is in JS.

## Data Persistence
One annoyance with web apps is data persistence. In a Python app I can read and write files directly on my computer, but with a web app there is an additional layer of complexity. Web apps are not supposed to access files directly on the user's computer, as this would be a security risk. It is obvious upon reflection, but at first sight it was an irritation.

I considered a number of options including to store the data in the user's browser, but this is is not ideal if I want to add multiplayer functionality. Eventually, I opted to use a database (SQLite) plus a simple script to serve the data. 

## Poor Randomness
As I found with my NovelWriter app, the randomness of the AI is not great. For DungeonGPT, the generated names are often too similar and stats tend to be chosen from a narrow range. I tested using a different AI, but I found that the results were not much better.

The challenges that I experienced while developing the NovelWriter app pushed me to create a dedicated app for analyzing AI text generation. This app is called [LLM Creative Writing Analyzer](https://github.com/edwardathomson/llm-creative-writing-analyzer) and it is available on GitHub. For those who are deeply interested in this topic, then I would recommend reading the report [here](https://github.com/EdwardAThomson/LLM-Creative-Writing-Analyzer/blob/main/reports/report.md).

The solution was to use templatest for the stats and to use a built-in name generator. It is still possible to use AI for the character descriptions. 

## Chat and summarization
The "game" part of the app is a chat interface, where the player can interact with the AI-powered dungeon master. Each message is sent to the AI, which then generates a response. The challenge here is that the AI doens't keep track of the game state (essentially just chat history), instead that has to be managed locally. As a quick and dirty solution, I save the 10 most recent chat messages and a summary to the database.

In the future, I should look into something more advanced. Maybe a RAG solution would be appropriate here.

### Game Settings
In order to provide a more personalized experience, I added a menu with various story settings. This includes the ability to set the tone plus a few other things.

## Map
Recently, I added a simple over-world map. The user can click on an adjacent location to move their character there. This also triggers a call to the AI to generate a new description of the location. 

Future versions will include a more advanced map, with multiple layers: e.g. the ability to enter a town (/ dungeon) and then see a map of the town (/ dungeon). I also need to add some randomness to the map generator, currently it is just provides a single layout.

## Lessons Learned

This project reinforced several key development principles that extend beyond game development:

- **Tool selection matters**: Moving from ChatGPT to Cursor IDE dramatically improved productivity and code quality
- **Platform trade-offs are real**: Web apps offer accessibility but require more complex architecture than desktop applications  
- **AI has specific strengths**: Use it for creative content generation, but rely on traditional methods for consistency
- **Iterative development works**: Starting simple and gradually adding features led to a more robust final product


## Conclusion

DungeonGPT now serves as both a playable game and a foundation for future enhancements. The modular React architecture and SQLite backend provide a solid base for the planned multi-layer maps and advanced context management features.

Most importantly, this project proved that ambitious ideas are achievable with persistence, the right tools, and a willingness to learn from both successes and setbacks.

The project highlights both the potential and limitations of current AI technology. While AI excels at generating creative descriptions and managing dynamic conversations, it still struggles with randomness and so is weak in areas like generating names and stats. The key is knowing when to rely on AI and when to use traditional programming approaches.

Looking ahead, I'm keen to expand the map system and explore more sophisticated context management solutions. DungeonGPT proves that with persistence and the right development environment, ambitious projects are achievable—even for developers learning new technologies along the way.