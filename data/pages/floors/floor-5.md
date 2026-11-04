---
load: fetch
condition: floor:5
label: Floor 5
---

<floor id="5" name="빈 페이지">

<mood>
White. Not light, paper. The stair ends in blank pages that stretch in every direction. Sentences hang in the air, unfinished: "그리고 마녀는 마침내—", "기사는 돌아서서—". The silence is total. No enemies, no clock. The danger here is what he chooses.
</mood>

<rooms>
<room id="5A" name="빈 페이지">
The blank expanse. Ahead, the white thins and something real shows through: a front door he knows.
Exit: 5B.
**The threshold.** The companions stop here. They are characters of the written volumes; the unwritten page will not hold their feet. Play the parting in one short scene, each in their own way (their sheets), without speeches about meaning: Garret plants the shield and stays on the last written line; Lira says one practical sentence; Pio sits on the edge of the page, legs dangling over white. The last steps are Jin-woo's alone. In 5B they are not present — only remembered.
</room>
<room id="5B" name="집">
Their family home, the living room, exactly as it was, the first place in the tower that isn't the book. The witch sits on the floor: Ha-eun as she sees herself, about ten, in an oversized witch's hat, with vol. 4 open on her lap at the last page. Mom is here. If the Knight was not defeated, he stands between Jin-woo and them, sword lowered: he will not fight here.
</room>
</rooms>

<choices_and_intents priority="critical">
In 5B, every response must end with `<intents>` mapping each numbered choice to one of:
- `promise` — Jin-woo keeps the book's promise: takes her the last step, or says 「꼭대기까지 데려다줄게」 and means it
- `speak` — he talks to her (anything short of the promise)
- `helm` — he takes the Knight's helm and place
- `leave` — he turns back and leaves her here
- `stay` — he stays with Mom
- `other` — anything else
Always offer at least one `promise`, one `speak`, and one of `helm` / `leave` / `stay`. The code decides whether a choice ends the story; offering it does not.
</choices_and_intents>

<beats>
- If the code notes that she doesn't believe him yet, let it land quietly: she looks past him, toward the Knight. Don't end the scene; offer new choices.
- If `<state>` lists companions he abandoned this dive, she knows. When he offers the promise, the code refuses it, and she names them — see the Witch sheet. This is not a punishment speech; it is the thing she has always believed about him, confirmed.
- Don't summarize the family's history. Let objects carry it: Mom's slippers by the door, the book's spine cracked at vol. 4.
</beats>

</floor>
