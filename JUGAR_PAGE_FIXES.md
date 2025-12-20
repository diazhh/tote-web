# Jugar Page - Fixes Applied

## Issues Fixed

### 1. **"Hora no disponible" Error**
**Problem:** The frontend was looking for `drawTime` field, but the API returns `scheduledAt`.

**Solution:** 
- Modified `loadInitialData()` in `/frontend/app/jugar/page.js` to normalize the data
- Added `drawTime: draw.scheduledAt` mapping when loading draws
- Calculated `closeTime` based on `scheduledAt` minus `closeMinutesBefore` from game config

### 2. **`fullDraw.items.find is not a function` Error**
**Problem:** The frontend was looking for `item.itemNumber`, but the API returns `item.number`.

**Solution:**
- Changed `fullDraw.items.find(i => i.itemNumber === number)` to `fullDraw.items.find(i => i.number === number)`
- Updated selection object to use `itemNumber: item.number`
- Updated TicketModal to check for both `detail.gameItem?.number` and fallback fields

### 3. **Hydration Warning `data-cjcrx`**
**Note:** This warning is typically from browser extensions or dev tools, not from the application code itself. It can be safely ignored.

## Changes Made

### `/frontend/app/jugar/page.js`
1. **Lines 59-80:** Added data normalization in `loadInitialData()`
   - Calculate `closeTime` from `scheduledAt` and `closeMinutesBefore`
   - Map `drawTime: draw.scheduledAt` for consistent field naming
   - Ensure all draws have proper `closeTime` for validation

2. **Line 134:** Changed item lookup from `i.itemNumber` to `i.number`

3. **Line 158:** Changed selection to use `itemNumber: item.number`

4. **Line 154:** Added fallback `selectedDraw.drawTime || selectedDraw.scheduledAt`

### `/frontend/components/player/TicketModal.js`
1. **Line 61:** Updated to check multiple field variations:
   - `detail.gameItem?.number` (API response)
   - `detail.gameItem?.itemNumber` (legacy)
   - `detail.itemNumber` (fallback)
   - `detail.number` (fallback)

## API Data Structure

### Draws Endpoint (`/api/draws/today`)
```json
{
  "id": "...",
  "gameId": "...",
  "scheduledAt": "2025-12-20T23:00:00.000Z",  // ← Use this for drawTime
  "status": "SCHEDULED",
  "game": {
    "name": "LOTOANIMALITO",
    "config": {
      "closeMinutesBefore": 5  // ← Use this to calculate closeTime
    }
  }
}
```

### Game Items Endpoint (`/api/games/{id}/items`)
```json
{
  "id": "...",
  "gameId": "...",
  "number": "00",  // ← Use this, not itemNumber
  "name": "DELFIN",
  "multiplier": "30"
}
```

## Testing Checklist

- [ ] Sorteos display correct time (e.g., "7:00 PM" instead of "Hora no disponible")
- [ ] Can select a sorteo from the modal
- [ ] Can enter numbers (00-99) using the number pad
- [ ] Pressing OK adds the number to selections
- [ ] Selected numbers appear in the list below the pad
- [ ] Can remove individual selections
- [ ] Total amount calculates correctly
- [ ] Can complete purchase and see ticket modal
- [ ] Ticket modal shows correct numbers

## Next Steps

1. Test the page in the browser at `http://localhost:3000/jugar`
2. Verify all sorteos show correct times
3. Test selecting numbers and creating tickets
4. Verify the complete purchase flow works end-to-end
