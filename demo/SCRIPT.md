# Demo script (about 2 minutes)

| # | Narration | On screen |
|---|-----------|-----------|
| 1 | Pausepoint is for anyone who leaves a physical job half done and has to pick it up days later, like furniture assembly or a recipe. This is a bookshelf, with its steps laid out as a graph. Each step lists what it needs first. | wait 1500 |
| 2 | Before stopping, I mark what is finished. Sorting the parts is done, and the two side panels are standing. Then I add a photo. These test photos are drawn on the fly, so there is nothing to download. | click "[data-step=s1]"; click "[data-step=s2]"; click "#btnSample"; wait 1200 |
| 3 | I leave a note for later, then tick the confirmation. Saving is blocked until I confirm that this photo and these steps really show where I stopped. | type ["#notes","Cam bolts for the top panel a; click "#confirm"; click "#save" |
| 4 | Back at the bookshelf, the app shows my checkpoint photo and my note. The project has moved on since, so I add a new photo. This one shows the bottom, two shelves, and the top panel in place. | select ["#preset","2"]; wait 1500 |
| 5 | Now the app sends both photos to Nemotron three point five Super VL on Nebius Token Factory, together with the step list. The model replies with a list of changes it sees. This takes a few seconds, and nothing it says counts yet. | click "#compare"; eval "(async()=>{for(let i=0;i<120;i++){if(do; wait 800 |
| 6 | Here are the proposed changes, each tied to a step and the evidence. The app already discarded anything that contradicts the step graph. I check each one against the photos and accept it, or reject it. | eval "(async()=>{for(const b of document.quer; wait 1200 |
| 7 | Once every change is decided, the next step comes from the step graph, not from the model. The frame is closed, so the back panel and the anti-tip bracket are both open. The graph recommends the back panel first, and I can choose either. | click "#resolve"; wait 2500; click "[data-pick=s6]" |
| 8 | My note is still in view, and I can pause again from here. That is Pausepoint: a confirmed checkpoint, a checked comparison, and a next step that follows the plan. | wait 2000 |
