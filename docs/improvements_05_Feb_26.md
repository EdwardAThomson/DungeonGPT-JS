# Improvements
Here is a list of improvements that we should consider for the game.


##  Sharing Links

### Desktop
On I'm using my desktop and I share a link (e.g. on Discord), there is no preview or icon. Typically when sharing a link there should be some sort of image. Surely we can find an image in one of the many that we have, otherwise we can generate a new image.


### Mobile
The icon on mobile, when sharing link is default React icon. It should be the crossed swords emoji that we currently use for now.

Ideally, there should be an image too.


## Mobile Issues (general)
The sign in link on mobile is overlapping the nav menu.


### How To Play Page
The buttons on the How To Play page over extend beyond the boundaries of the container.


## Settings Menu 

There is text that says:

"API Keys

Cloud API keys are configured in the .env file on the server. Use gemini-cli, claude-cli, or codex providers for CLI-based access without API keys."

This should be removed.


## How To Play Page (general)

The yellow line on the left side of the "How To Play" page is taking up space unnecessarily. Perhaps we can have a yellow line at the top of each section in order to demarcate them?


## Authentication
This is a longer term consideration, but we should create a document to plan what is necessary for adding further sign in options. Currently we use Supabase for authentication.

### SSO
Can we add the following sign in options?

* SSO with Google
* SSO with GitHub
* SSO with Discord

### Magic Links
Is this something we can add alongside a password? Perhaps even as the default.

