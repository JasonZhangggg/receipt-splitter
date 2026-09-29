# Receipt Splitter

Splitting one group bill from a photo of its receipt: reading the items, deciding who owes what, and handing each person off to pay.

## Language

### People

**Host**:
The person who paid the bill and scanned the receipt to start the Split. Every Share is owed to the Host. After creating the Split, the Host has no more control over it than anyone else.
_Avoid_: Creator, owner, payer, organizer

**Participant**:
A person who shared the bill, including the Host. Every Participant but the Host owes the Host their Share.
_Avoid_: Member, friend, guest, user

**Payment handle**:
The Host's username, tag, email or phone on Venmo, Cash App, PayPal or Zelle, which Participants use to pay their Share. Set when the Split is created.
_Avoid_: Account, payment method

### The bill

**Split**:
One bill being divided: its receipt, its Participants, and who Claimed which Items.
_Avoid_: Bill, room, session, group

**Receipt**:
The printed bill the Host photographs, and the items and totals read from it.

**Item**:
One priced row on the receipt, such as a dish or drink. Its price includes its quantity and any modifiers or discounts printed under it.
_Avoid_: Line, entry, product

**Adjustment**:
A charge or credit on the receipt that is not an Item: tax, tip, or a receipt-level discount.
_Avoid_: Fee, extra

**Total check**:
The test that the Items add up to the subtotal, and the subtotal plus Adjustments equals the total.
_Avoid_: Validation, reconciliation

### Dividing it

**Claim**:
Marking an Item as shared by a Participant. Anyone with the Split's link can Claim or unclaim any Item for any Participant. An Item Claimed by several people is split evenly among them.
_Avoid_: Assignment, pick, select

**Unclaimed item**:
An Item no Participant has Claimed.
_Avoid_: Unassigned item

**Share**:
One Participant's part of the bill: their Claimed Items plus a part of the Adjustments proportional to those Items.
_Avoid_: Portion, amount owed, balance

**Payment**:
A Participant's own report that they paid the Host, with the amount they paid. The app never sees the actual transfer.
_Avoid_: Settlement, transaction
