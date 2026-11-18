NAME='Accounts - Group Memberships'
DESCRIPTION='Every group that has members, with the members listed, and the groups that give administrative rights (sudo, wheel, admin, adm, docker, lxd, disk, shadow).'
DEPENDENCIES=()
TAGS=(accounts privilege-escalation)

printf 'Group\tGid\tPrivileged\tMembers\n'
getent group 2>/dev/null </dev/null | awk -F: 'BEGIN{OFS="\t"; p="sudo wheel admin adm docker lxd lxc disk shadow root staff kvm libvirt"} $4!="" {priv="no"; n=split(p,a," "); for(i=1;i<=n;i++) if($1==a[i]) priv="yes"; print $1,$3,priv,$4}'
exit 0
