# Receipt Splitter

Splitting one group bill from a photo of its receipt: reading the items, deciding who owes what, and handing each person off to pay.

## Language

### People

**Host**:
The person who paid the bill and scanned the receipt to start the Split. Every Share is owed to the Host. After creating the Split, the Host has no more control over it than anyone else.
_Avoid_: Creator, owner, payer, organizer. The one exception is **Creator secret**.

**Creator secret**:
The token the creating device keeps and sends to change the Payment handles. It is a key, not a role, so it gives the Host no other control. The code uses this name.
_Avoid_: Host secret, host key

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

**Detail**:
Supplementary text under an Item's name, such as a size, a flavor, a weight, an unpriced modifier, or a discount folded into its price ("$2.00 off"). One line of at most 120 characters. The name alone identifies the Item. Anyone can edit it, and History lists the edit.
_Avoid_: Description, note

**Adjustment**:
A charge or credit on the receipt that is not an Item: tax, tip, a service charge, a receipt-level discount, or a Bundle's discount. A bag fee or a bottle deposit the receipt prints is a service charge.
_Avoid_: Fee, extra

**Bundle**:
A group of Items the receipt prints under one $0.00 header, such as a Beer Bucket, with a discount that covers only those Items. The header is the Bundle's name, not an Item.
_Avoid_: Bucket, combo, group, package

**Receipt photo**:
The downscaled copy of the Host's photo that the Split keeps, so everyone in it can view the receipt. It is deleted 14 days after the Split is created, and the Split stays.
_Avoid_: Image, scan, attachment

**Total check**:
The test that the Items add up to the subtotal, and the subtotal plus Adjustments equals the total. A failed check blocks nothing. It shows as a quiet note, and anyone can fix the rows it names.
_Avoid_: Validation, reconciliation

### Dividing it

**Claim**:
Marking a whole Item as had by a Participant, whatever its quantity. Anyone with the Split's link can Claim or unclaim any Item for any Participant. An Item Claimed by several people divides by its Split mode, evenly unless someone changes it.
_Avoid_: Assignment, pick, select

**Unit**:
One of the things an Item's quantity counts, such as one of three cans on a "3x Guinness" line. A unit has no claimers of its own until the line is split, which turns each unit into its own one-unit Item.

**Split mode**:
How an Item's whole price divides among the people who had it: evenly, by whole-number shares, or by amount in cents. Cents an amount split leaves count as Unclaimed.
_Avoid_: Split type, method

**Pick**:
A device saying which Participant it is. One device holds a name at a time, and **That's me** moves a picked name to the device that asks, with no check and no History entry. A Pick is not a Claim.
_Avoid_: Join, login

**Unclaimed item**:
An Item no Participant has Claimed, or cents an amount split leaves. Nobody pays for it.
_Avoid_: Unassigned item

**Share**:
One Participant's part of the bill: their Claimed Items, a part of each Bundle discount proportional to their Items in that Bundle, and a part of the other Adjustments proportional to their Items after Bundle discounts.
_Avoid_: Portion, amount owed, balance

**Recent split**:
A Split this device created or opened, listed on home with its names, the day the device first saw it, and its total. It stays on the device only, and leaves the list 60 days after the device last opened it or once its link says it has expired.
_Avoid_: History, which is the Split page's list of payments and receipt changes

**Payment**:
A Participant's own report that they paid the Host, with the amount they paid. The app never sees the actual transfer. Only the device that picked the name records or clears its Payment. That rule stops honest mistakes and is not a security check, because **That's me** lets any device take a name. History shows a Payment but cannot revert it.
_Avoid_: Settlement, transaction
