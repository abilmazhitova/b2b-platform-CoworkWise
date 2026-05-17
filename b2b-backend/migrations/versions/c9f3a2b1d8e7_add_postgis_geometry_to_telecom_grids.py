"""Add PostGIS geometry column to telecom_grids

Revision ID: c9f3a2b1d8e7
Revises: e3c216f83ff2
Create Date: 2026-05-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision: str = 'c9f3a2b1d8e7'
down_revision: Union[str, Sequence[str], None] = 'e3c216f83ff2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.add_column(
        'telecom_grids',
        sa.Column('geom', Geometry('POLYGON', srid=4326), nullable=True),
    )

    # Populate geometry from existing coordinate columns (xmin, ymin, xmax, ymax)
    op.execute("""
        UPDATE telecom_grids
        SET geom = ST_SetSRID(
            ST_MakeEnvelope(long_bot_left, lat_bot_left, long_top_right, lat_top_right),
            4326
        )
        WHERE long_bot_left IS NOT NULL
          AND lat_bot_left IS NOT NULL
          AND long_top_right IS NOT NULL
          AND lat_top_right IS NOT NULL
    """)

    op.create_index(
        'ix_telecom_grids_geom',
        'telecom_grids',
        ['geom'],
        postgresql_using='gist',
    )


def downgrade() -> None:
    op.drop_index('ix_telecom_grids_geom', table_name='telecom_grids')
    op.drop_column('telecom_grids', 'geom')
    # PostGIS extension is intentionally NOT dropped — other objects may depend on it