# Inspiration images

Drop reference images here (`kitchen-01.jpg`, `facade-grey.jpg`, …) and point a scheme at them
from `src/model/finishes.ts`:

```ts
image: 'inspiration/kitchen-01.jpg'
```

Files in `public/` are copied to the site root as-is, so the path has no leading slash and no
hash. Keep them under ~400 kB each — they load with the page.

Do not put anything here that identifies the house or its location.
