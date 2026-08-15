# `deploy.sh` se mudó al repo de Torre

Ahora vive en **`torre/scripts/deploy.sh`**.

## Por qué

Estaba acá por historia: es anterior a Torre. Conceptualmente siempre fue de
Torre, y el costo de tenerlo mal ubicado se pagaba en cada cambio del pipeline
—tocarlo empujaba un commit a este repo, y eso **disparaba un deploy de lila**.
El 15/08/2026 tres arreglos del pipeline redeployaron lila tres veces con código
idéntico, llenando el canal de Telegram de avisos que no correspondían.

## Si buscabas el script

```bash
bash /Users/jose/projects/torre/scripts/deploy.sh {lila|portal|torre} [sha|--rollback|--list]
```

Torre lo resuelve solo; `TORRE_DEPLOY_SCRIPT` sigue funcionando para apuntarlo a
otro lado.
