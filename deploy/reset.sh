#!/bin/bash
# 清空测试数据并输出当前计数
su - postgres -c "psql -d liangshan -f /tmp/reset.sql"
su - postgres -c "psql -d liangshan -tAc 'SELECT count(*) FROM users'"
su - postgres -c "psql -d liangshan -tAc 'SELECT count(*) FROM bird_logs'"
su - postgres -c "psql -d liangshan -tAc 'SELECT count(*) FROM events'"
