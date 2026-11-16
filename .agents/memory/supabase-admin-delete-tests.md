---
name: Supabase-Admin-Löschtests
description: Testaufbau für den Supabase-JavaScript-Admin-Endpunkt zum Löschen von Konten.
---

Lokale Mocks für `auth.admin.deleteUser()` müssen neben dem DELETE-Aufruf auch die vorherige Admin-Abfrage des Kontos beantworten.

**Why:** Die installierte Supabase-JavaScript-Clientversion lädt das Konto vor dem Löschen, um den zurückgegebenen Nutzer zu ergänzen. Ein Mock, der nur DELETE behandelt, meldet deshalb einen Löschfehler, bevor die Löschung erreicht wird.

**How to apply:** Bei API-Tests mit einem Supabase-Auth-Mock den GET auf `/auth/v1/admin/users/{id}` mit einem passenden Nutzerobjekt beantworten und anschließend das DELETE separat simulieren.
