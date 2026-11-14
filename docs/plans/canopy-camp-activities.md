<!-- Copied into the repo from the project files (canopy-hide-and-seek/activities-plan.md) on 2026-11-14, review R2-219, so the code's
     pointers resolve in a clone. This copy is the one to keep up to date. Where it and the code differ, the code is the record:
     there is no Rest button any more; the time of day comes from the clock slider and the day cycle in the settings menu. -->
# Canopy Camp activities: the settled plan

Planned with Adriaen on 2026-11-11 in the thread "Plan camp activities". Revised 2026-11-12: Adriaen simplified the loop, so there is no befriending; the sloths live in camp from the start. Code: `apps/canopy-prototype/camp.html` in adrver1/sloth (shared with the jeep, props, atmosphere and sloth life threads).

## How activities work
- Calm: no timer, no score, no way to fail. The reward is a cozier camp and sloths reacting. No counters.
- Walk up to a thing (about 2.5 m), a soft hint shows on it, tap it. Hold stays for feeding. No extra on-screen buttons.
- You carry one thing at a time, shown bottom right of the view.
- Dusk stays on the Rest button.

## Chores
- **Fire:** take a log from the wood pile (props thread's pile; a plain log stack until it lands), carry it to the fire, tap. The fire flares for about a minute, then settles over a few minutes, never goes out. Up to 3 logs stack for a bigger blaze and more sparks. The sloth nearest the fire turns to it with a slow, happy blink.
- **Soup pot** (replaced the kettle, 2026-11-11): the open pot hangs on the tripod over the teepee fire. Fill it at a water canister, add 2-3 ingredients, it bubbles, then ladle bowls onto a log seat and nearby sloths gather.
- **Lanterns:** 4 lanterns start unlit in a basket by the tent. Hang them on the string one at a time; at dusk light each with a burning twig carried from the fire.

## Snacks and favourites
- A fruit basket by the snack table holds four snacks, plain fruit: hibiscus, mango slice, fig, banana. It never runs out.
- Feeding needs a snack in hand: hold one, then hold on a sloth. Empty hands: hint "Grab a snack from the basket".
- The seven named sloths live in camp from the start and go about their day (sloth life thread: walking, eating from the crate and table, s'mores on the bench, meeting each other, a slow wave when you look at one for about 3 s). A few plain wild sloths still hang in the trees, one per tree.
- Every sloth has one favourite (kept as a small discovery, 2026-11-12). It gladly eats every snack ("nom nom", hearts); its favourite gets an extra-happy reaction and a tick on its journal page. Nothing else depends on it.
- Putting a snack on the table makes nearby sloths turn their heads to it; the hibiscus draws one down.
- Booping a sloth now and then gives a gentle clue to its favourite, like "*dreams of something pink*".

## The seven sloths
| Name | Trait | Favourite |
| --- | --- | --- |
| Hibi | small hibiscus by the ear | hibiscus |
| Mango | dotted orange bandana on the head | mango |
| Figgy | leaf hat | fig |
| Bandit | small banana-leaf cape | banana |
| Pip | the smallest | hibiscus |
| Hazel | small blue bow | fig |
| Sunny | yellow scarf at the neck | mango |

Preview: `sloth-names-phone.png`, `sloth-names-desktop.png` here; page `apps/canopy-prototype/prototypes/names-prototype.html`.

## Sloth journal (was the friendship book)
- Lies on the snack table; tap to open, one page per sloth. After the first time also opens from a small 📖 in the corner.
- A page for each of the seven: portrait, name, trait, snacks tried (favourite ticked once found), a one-line note ("Loves the hammock").
- Until you have photographed a sloth, its page shows a simple drawn portrait.

## Photo album
- A camera on the jeep's bonnet. Pick it up: a viewfinder frame shows, a tap takes the photo. It goes into a scrapbook next to the friendship book.
- No limit: each photo is a PNG in the camp page's own storage on claude.ai (artifact assets), loaded one page at a time, following you between devices. Fallback where that isn't available: browser storage on that device. Every photo has a "Save to phone" button. Anyone the camp link is shared with could see the photos.
- A photo of a sloth becomes its journal portrait.

## Saving
- The journal and photos stay saved between visits; a "Start over" link inside the book.

## Build order (each chunk goes on the camp page to try before the next)
1. Wood on the fire (sets up carrying and tap hints)
2. The soup pot
3. The lanterns at dusk
4. Snack basket and favourites (feeding no longer recruits a sloth)
5. Sloth journal
6. Photo album
