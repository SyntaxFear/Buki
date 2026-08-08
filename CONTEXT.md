# Buki

Buki is a parent-facing library for preserving and organizing children’s artwork. The adult owns the account, membership, child profiles, sketchpads, and cloud data.

## Language

**Adult Account**:
The authenticated owner of every child profile and artwork library in one Buki account.
_Avoid_: Parent profile, family account, user account

**Child Profile**:
An organizing record owned by an Adult Account; it is never an independent login.
_Avoid_: Child account, kid user

**Sketchpad**:
A named, styled collection of artworks belonging to one Child Profile.
_Avoid_: Album, book, folder

**Artwork**:
A saved drawing record and its associated image files and metadata.
_Avoid_: Scan, photo, asset

**Membership**:
The Free or Pro access level applied to an Adult Account, independent of how Pro was purchased.
_Avoid_: Subscription tier, plan

**Pro Product**:
The monthly, yearly, or lifetime store product that grants the same Pro Membership.
_Avoid_: Pro tier, feature package

**Over-limit Library**:
Preserved content whose count exceeds current Free limits after migration or Pro expiry; it remains viewable and editable, but additional content is blocked at that resource limit.
_Avoid_: Invalid library, excess content

**Cloud Retention**:
The 90-day read-only period after Pro access ends during which cloud data can still be restored or deleted but not uploaded or exported.
_Avoid_: Grace period, backup trial
